import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EventsService } from '../services/events.service';
import { AuthUser, CurrentUser, Roles, RequiresStrategy, RequiresVerified } from '../../common/decorators';
import { RegisterEventDto, CheckInDto, CreateEventDto, EventQueryDto, UpdateEventDto } from '../dto/event.dto';

/** §6.10 campus events: public list/detail + registration + tickets. */
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Query() query: EventQueryDto, @CurrentUser() user: AuthUser) {
    return this.events.list(query, user);
  }

  @Get(':id')
  one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.events.detail(user, id);
  }

  /** Organizer/admin: list the event's registrants + check-in state (§6.10). */
  @Get(':id/registrations')
  registrations(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.events.registrations(user, id);
  }

  /** Any logged-in viewer: who has signed up (name + avatar only, §6.10). */
  @Get(':id/attendees')
  attendees(@Param('id') id: string) {
    return this.events.attendees(id);
  }

  @RequiresStrategy('can_post_forum')
  @RequiresVerified()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.events.create(dto, user.id);
  }

  /** Organizer or admin edit / status change (ownership enforced in the service). */
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.events.update(user, id, dto);
  }

  @Post(':id/register')
  register(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RegisterEventDto) {
    return this.events.register(user, id, dto);
  }

  @Delete(':id/register')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.events.cancel(user, id);
  }

  @Get(':id/ticket')
  ticket(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.events.ticket(user, id);
  }

  @Post(':id/check-in')
  checkIn(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CheckInDto) {
    return this.events.checkIn(user, id, dto.ticket);
  }
}

/** §6.10 the caller's registrations + live tickets (My tickets). */
@Controller('me/event-registrations')
export class MyEventRegistrationsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser, @Query('upcoming') upcoming?: string) {
    return this.events.myRegistrations(user, upcoming);
  }
}
