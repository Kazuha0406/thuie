import { Body, Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser, RequiresStrategy, RequiresVerified, Roles } from '../common/decorators';
import { ApiException } from '../common/error/api.exception';
import { canView, visibleVisibilities } from '../common/util/visibility';
import { serializeUser } from '../common/serializers/user.serializer';
import { Comment, User } from '../entities';
import { ModerationModule } from '../moderation/moderation.module';
import { ModerationService } from '../moderation/services/moderation.service';

class FeedQuery {
  @IsOptional() @IsString() @Length(0, 100) q?: string;
  @IsOptional() @IsString() @Length(0, 100) tag?: string;
  @IsOptional() @IsIn(['newest', 'oldest', 'likes']) sort = 'newest';
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
class CommentBody {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 5000) content!: string;
}
const targets = {
  info: { table: 'info_posts', column: 'info_post_id' },
  post: { table: 'forum_posts', column: 'forum_post_id' },
  event: { table: 'campus_events', column: 'event_id' },
} as const;

@Injectable()
class FeedService {
  constructor(private readonly db: DataSource, private readonly moderation: ModerationService) {}

  async list(user: AuthUser, query: FeedQuery) {
    const order = query.sort === 'likes' ? 'like_count DESC, created_at DESC' : `created_at ${query.sort === 'oldest' ? 'ASC' : 'DESC'}`;
    // Filter and sort the complete union before paging, rather than sorting three partial feeds.
    const rows = await this.db.query(`WITH feed AS (
      SELECT 'info' AS kind, i.id, i.title, i.content, i.created_at, i.author_id,
        ARRAY[CASE WHEN i.category='recruitment' THEN 'recruitment' ELSE 'information' END] AS tags,
        (SELECT count(*)::int FROM content_likes l WHERE l.target_type='info' AND l.target_id=i.id) AS like_count
      FROM info_posts i WHERE i.status='approved' AND i.visibility=ANY($1::text[])
      UNION ALL
      SELECT 'post', p.id, p.title, p.content, p.created_at, p.author_id,
        ARRAY['discussion'] || ARRAY(SELECT t.slug FROM post_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.post_id=p.id),
        (SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id)
      FROM forum_posts p WHERE p.status='approved'
      UNION ALL
      SELECT 'event', e.id, e.title, COALESCE(e.description,''), e.created_at, e.created_by, ARRAY['events', e.type],
        (SELECT count(*)::int FROM content_likes l WHERE l.target_type='event' AND l.target_id=e.id)
      FROM campus_events e WHERE e.status='published'
    ) SELECT f.*, json_build_object('id',u.id::text,'name',u.name,'role',u.role) AS author,
      count(*) OVER()::int AS total
      FROM feed f LEFT JOIN users u ON u.id=f.author_id
      WHERE ($2='' OR $2=ANY(f.tags)) AND ($3='' OR f.title ILIKE $4 OR f.content ILIKE $4)
      ORDER BY ${order}, kind, id DESC LIMIT $5 OFFSET $6`,
      [visibleVisibilities(user), query.tag ?? '', query.q ?? '', `%${query.q ?? ''}%`, query.limit, (query.page - 1) * query.limit]);
    const tags = await this.db.query('SELECT slug,name FROM tags');
    return { tag_labels: Object.fromEntries(tags.map((t: { slug: string; name: string }) => [t.slug,t.name])), data: rows, total: rows[0]?.total ?? 0, page: query.page, limit: query.limit };
  }

  async target(user: AuthUser, kind: string, id: string) {
    const spec = targets[kind as keyof typeof targets];
    if (!spec || !/^\d+$/.test(id)) throw ApiException.notFound();
    const [row] = await this.db.query(`SELECT * FROM ${spec.table} WHERE id=$1`, [id]);
    if (!row) throw ApiException.notFound();
    const owner = row.author_id ?? row.created_by;
    const allowed = kind === 'event' ? row.status === 'published' : canView(row, user);
    if (!allowed && !user.is_admin && String(owner) !== user.id) throw ApiException.notFound();
    return spec;
  }

  async discussion(user: AuthUser, kind: string, id: string) {
    const spec = await this.target(user, kind, id);
    const comments = await this.db.query(`SELECT c.id::text,c.content,c.status,c.created_at,
      json_build_object('id',u.id::text,'name',u.name,'role',u.role) AS author
      FROM comments c JOIN users u ON u.id=c.author_id WHERE c.${spec.column}=$1
      AND (c.status='approved' OR ($2 AND c.status<>'taken_down') OR (c.author_id=$3 AND c.status<>'taken_down'))
      ORDER BY c.created_at,c.id`, [id, user.is_admin, user.id]);
    const table = kind === 'post' ? 'post_likes' : 'content_likes';
    const predicate = kind === 'post' ? 'post_id=$1' : 'target_id=$1 AND target_type=$3';
    const [likes] = await this.db.query(`SELECT count(*)::int AS count, COALESCE(bool_or(user_id=$2),false) AS liked FROM ${table} WHERE ${predicate}`, kind === 'post' ? [id, user.id] : [id, user.id, kind]);
    return { comments, ...likes };
  }

  async comment(user: AuthUser, kind: string, id: string, dto: CommentBody) {
    const spec = await this.target(user, kind, id);
    const status = await this.moderation.scan([dto.content]);
    const repo = this.db.getRepository(Comment);
    const saved = await repo.save(repo.create({ [spec.column]: id, author_id: user.id, content: dto.content, status }));
    await this.moderation.record({ targetType: 'comment', targetId: saved.id, actorId: user.id, action: 'submitted' });
    return { id: saved.id, status };
  }

  async like(user: AuthUser, kind: string, id: string) {
    const spec = await this.target(user, kind, id);
    await this.db.transaction(async m => {
      await m.query(`SELECT id FROM ${spec.table} WHERE id=$1 FOR UPDATE`, [id]);
      if (kind === 'post') {
        const existing = await m.query('SELECT user_id FROM post_likes WHERE post_id=$1 AND user_id=$2', [id, user.id]);
        if (existing.length) await m.query('DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2', [id, user.id]);
        else await m.query('INSERT INTO post_likes(post_id,user_id) VALUES($1,$2)', [id, user.id]);
        await m.query('UPDATE forum_posts SET like_count=(SELECT count(*) FROM post_likes WHERE post_id=$1) WHERE id=$1', [id]);
      } else {
        const existing = await m.query('SELECT user_id FROM content_likes WHERE target_id=$1 AND user_id=$2 AND target_type=$3', [id, user.id, kind]);
        if (existing.length) await m.query('DELETE FROM content_likes WHERE target_id=$1 AND user_id=$2 AND target_type=$3', [id, user.id, kind]);
        else await m.query('INSERT INTO content_likes(target_id,user_id,target_type) VALUES($1,$2,$3)', [id, user.id, kind]);
      }
    });
    return this.discussion(user, kind, id);
  }

  async member(id: string) {
    if (!/^\d+$/.test(id)) throw ApiException.notFound();
    const user = await this.db.getRepository(User).findOne({ where: { id }, relations: { department: true, avatar_media: true } });
    if (!user || user.status === 'deleted' || user.status === 'banned') throw ApiException.notFound();
    return serializeUser(user);
  }

  async preview(type: string, id: string) {
    const spec = ({ info_post: ['info_posts','author_id','title','content'], forum_post: ['forum_posts','author_id','title','content'],
      comment: ['comments','author_id','content','content'], alumni_profile: ['alumni_profiles','user_id','display_name','bio'],
      event: ['campus_events','created_by','title','description'],
      user: ['users','id','name','bio'] } as Record<string,string[]>)[type];
    if (!spec || !/^\d+$/.test(id)) throw ApiException.notFound();
    const [table, author, title, content] = spec;
    const [row] = await this.db.query(`SELECT r.id::text,r.${title} AS title,r.${content} AS content,r.status,
      json_build_object('id',u.id::text,'name',u.name,'role',u.role) AS author
      FROM ${table} r LEFT JOIN users u ON u.id=r.${author} WHERE r.id=$1`, [id]);
    if (!row) throw ApiException.notFound();
    const attachments = await this.db.query(`SELECT m.id::text,m.file_name,m.mime_type FROM post_media p JOIN media_objects m ON m.id=p.media_id WHERE p.owner_type=$1 AND p.owner_id=$2`, [type,id]);
    if (type === 'event') attachments.push(...await this.db.query('SELECT m.id::text,m.file_name,m.mime_type FROM campus_events e JOIN media_objects m ON m.id=e.cover_media_id WHERE e.id=$1', [id]));
    return { ...row, attachments: attachments.map((m: { id: string; file_name: string; mime_type: string }) => ({ ...m, url: `/api/v1/media/${m.id}/${encodeURIComponent(m.file_name)}` })) };
  }
}

@Controller('feed')
class FeedController {
  constructor(private readonly feed: FeedService) {}
  @Get() list(@CurrentUser() user: AuthUser, @Query() query: FeedQuery) { return this.feed.list(user, query); }
  @Get(':kind/:id/discussion') discussion(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Param('id') id: string) { return this.feed.discussion(user, kind, id); }
  @Post(':kind/:id/comments') @RequiresStrategy('can_comment') @RequiresVerified()
  comment(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Param('id') id: string, @Body() body: CommentBody) { return this.feed.comment(user,kind,id,body); }
  @Post(':kind/:id/like')
  like(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Param('id') id: string) { return this.feed.like(user,kind,id); }
}
@Controller('members')
class MembersController {
  constructor(private readonly feed: FeedService) {}
  @Get(':id') member(@Param('id') id: string) { return this.feed.member(id); }
}
@Controller('admin/content') @Roles('admin','admin_super')
class ContentPreviewController {
  constructor(private readonly feed: FeedService) {}
  @Get(':type/:id') preview(@Param('type') type: string, @Param('id') id: string) { return this.feed.preview(type,id); }
}
@Module({ imports: [ModerationModule], providers: [FeedService], controllers: [FeedController, MembersController, ContentPreviewController] })
export class FeedModule {}
