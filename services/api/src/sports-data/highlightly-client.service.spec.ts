import { ConfigService } from '@nestjs/config';
import { HighlightlyClient } from './highlightly-client.service';
import { SportsDataBudgetService } from './sports-data-budget.service';
import { SportsDataNotFoundError } from './sports-data-client';
import { SportsDataUpstreamError } from './sports-data.errors';

function buildConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const defaults: Record<string, unknown> = { SPORTS_DATA_API_KEY: 'real-key-123' };
  return { get: (key: string) => (overrides[key] !== undefined ? overrides[key] : defaults[key]) } as unknown as ConfigService;
}

function buildBudget(): SportsDataBudgetService {
  return { reserveRequest: jest.fn().mockResolvedValue(undefined) } as unknown as SportsDataBudgetService;
}

function mockJsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('HighlightlyClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('is wired but inactive (throws SportsDataUpstreamError, never calls fetch) when SPORTS_DATA_API_KEY is unset or the placeholder', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const client = new HighlightlyClient(buildConfig({ SPORTS_DATA_API_KEY: 'replace-me-once-vendor-is-selected' }), buildBudget());

    await expect(client.getMatchById('123')).rejects.toBeInstanceOf(SportsDataUpstreamError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reserves budget BEFORE firing the real HTTP request', async () => {
    const budget = buildBudget();
    const calls: string[] = [];
    (budget.reserveRequest as jest.Mock).mockImplementation(async () => {
      calls.push('reserve');
    });
    global.fetch = jest.fn().mockImplementation(async () => {
      calls.push('fetch');
      return mockJsonResponse(200, { data: [], pagination: {} });
    }) as unknown as typeof fetch;

    const client = new HighlightlyClient(buildConfig(), budget);
    await client.getMatches({ date: '2026-09-16' });

    expect(calls).toEqual(['reserve', 'fetch']);
  });

  it('sends x-rapidapi-key on every request, and x-rapidapi-host ONLY when SPORTS_DATA_RAPIDAPI_HOST is set', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(mockJsonResponse(200, { data: [], pagination: {} }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const client = new HighlightlyClient(buildConfig(), buildBudget());
    await client.getMatches({ date: '2026-09-16' });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['x-rapidapi-key']).toBe('real-key-123');
    expect(init.headers['x-rapidapi-host']).toBeUndefined();
  });

  it('sends x-rapidapi-host when SPORTS_DATA_RAPIDAPI_HOST is configured', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(mockJsonResponse(200, { data: [], pagination: {} }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const client = new HighlightlyClient(buildConfig({ SPORTS_DATA_RAPIDAPI_HOST: 'football-highlights-api.p.rapidapi.com' }), buildBudget());
    await client.getMatches({ date: '2026-09-16' });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['x-rapidapi-host']).toBe('football-highlights-api.p.rapidapi.com');
  });

  it('getMatches unwraps the {data, pagination} envelope confirmed from Highlightly\'s own docs example', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockJsonResponse(200, { data: [{ id: 1, date: '2026-09-16T15:00:00.000Z', homeTeam: {}, awayTeam: {}, state: { description: 'Not started' } }], pagination: { totalCount: 1 } }),
    ) as unknown as typeof fetch;

    const client = new HighlightlyClient(buildConfig(), buildBudget());
    const page = await client.getMatches({ date: '2026-09-16' });

    expect(page.items).toHaveLength(1);
    expect(page.totalCount).toBe(1);
  });

  it('getMatchById accepts a bare object response', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse(200, { id: 1, date: '2026-09-16T15:00:00.000Z', homeTeam: {}, awayTeam: {}, state: { description: 'Not started' } })) as unknown as typeof fetch;
    const client = new HighlightlyClient(buildConfig(), buildBudget());

    const match = await client.getMatchById('1');
    expect(match.id).toBe(1);
  });

  it('getMatchById ALSO accepts a one-element array response (documented ambiguity — see this file\'s own header comment)', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse(200, [{ id: 1, date: '2026-09-16T15:00:00.000Z', homeTeam: {}, awayTeam: {}, state: { description: 'Not started' } }])) as unknown as typeof fetch;
    const client = new HighlightlyClient(buildConfig(), buildBudget());

    const match = await client.getMatchById('1');
    expect(match.id).toBe(1);
  });

  it('throws SportsDataNotFoundError on a 404 response', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse(404, {})) as unknown as typeof fetch;
    const client = new HighlightlyClient(buildConfig(), buildBudget());

    await expect(client.getMatchById('missing')).rejects.toBeInstanceOf(SportsDataNotFoundError);
  });

  it('throws SportsDataUpstreamError on a non-404 error response', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse(500, {})) as unknown as typeof fetch;
    const client = new HighlightlyClient(buildConfig(), buildBudget());

    await expect(client.getMatchById('1')).rejects.toBeInstanceOf(SportsDataUpstreamError);
  });

  it('throws SportsDataUpstreamError on a genuine network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const client = new HighlightlyClient(buildConfig(), buildBudget());

    await expect(client.getMatchById('1')).rejects.toBeInstanceOf(SportsDataUpstreamError);
  });

  it('getStandings unwraps the {groups} envelope confirmed from Highlightly\'s own docs example', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse(200, { groups: [{ name: 'Premier League', standings: [] }] })) as unknown as typeof fetch;
    const client = new HighlightlyClient(buildConfig(), buildBudget());

    const groups = await client.getStandings('133', '2026');
    expect(groups).toEqual([{ name: 'Premier League', standings: [] }]);
  });

  it('getMatchStatistics and getMatchEvents and getHeadToHead pass through bare top-level arrays unmodified', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse(200, [{ team: { id: 1, name: 'A' }, statistics: [] }])) as unknown as typeof fetch;
    const client = new HighlightlyClient(buildConfig(), buildBudget());

    const stats = await client.getMatchStatistics('1');
    expect(stats).toEqual([{ team: { id: 1, name: 'A' }, statistics: [] }]);
  });

  it('getHighlights sends matchId/limit/offset as query params and unwraps {data, pagination}', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(mockJsonResponse(200, { data: [], pagination: { totalCount: 0 } }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const client = new HighlightlyClient(buildConfig(), buildBudget());

    await client.getHighlights({ matchId: '1', limit: 40 });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/highlights?');
    expect(url).toContain('matchId=1');
    expect(url).toContain('limit=40');
  });
});
