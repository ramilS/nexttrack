import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SearchService } from './search.service';
import { AutocompleteService } from './query-language/autocomplete.service';
import { IssueIndexerService } from './indexer/issue-indexer.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { GlobalRole } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiEnvelope, ApiRaw } from '@/common/decorators/api-envelope.decorator';
import {
  SearchQueryDto,
  AutocompleteQueryDto,
  ValidateQueryDto,
  ReindexDto,
  AutocompleteSuggestionDto,
  ValidateResponseDto,
  ReindexResponseDto,
  SearchResponseDto,
} from './search.dto';

@Controller('search')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SearchController {
  constructor(
    private searchService: SearchService,
    private autocompleteService: AutocompleteService,
    private issueIndexer: IssueIndexerService,
  ) {}

  @Get()
  @ApiRaw(SearchResponseDto)
  async search(
    @Query() query: SearchQueryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.searchService.search(query.q, userId, {
      projectId: query.projectId,
      cursor: query.cursor,
      pageSize: query.pageSize,
    });
  }

  @Get('autocomplete')
  @ApiEnvelope([AutocompleteSuggestionDto])
  async autocomplete(
    @Query() query: AutocompleteQueryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.autocompleteService.getSuggestions(
      query.q,
      query.cursor ?? query.q.length,
      query.projectId ?? null,
      userId,
    );
  }

  @Get('validate')
  @ApiEnvelope(ValidateResponseDto)
  async validate(@Query() query: ValidateQueryDto) {
    return this.searchService.validateQuery(query.q);
  }

  @Post('reindex')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(ReindexResponseDto)
  async reindex(@Body() dto: ReindexDto) {
    if (dto.projectKey) {
      return dto.async
        ? this.issueIndexer.scheduleProjectReindex(dto.projectKey)
        : this.issueIndexer.reindexProjectByKey(dto.projectKey);
    }
    return this.issueIndexer.reindexAll();
  }
}
