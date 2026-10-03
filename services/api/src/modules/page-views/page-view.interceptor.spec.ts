import 'reflect-metadata';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { lastValueFrom, of, throwError } from 'rxjs';
import { PageViewInterceptor } from './page-view.interceptor';
import { PageViewService } from './page-view.service';

interface BuildContextOptions {
  type?: 'http' | 'rpc';
  method?: string;
  query?: Record<string, unknown>;
  statusCode?: number;
  controllerPath?: string | string[];
  handlerPath?: string | string[];
}

function buildContext(options: BuildContextOptions = {}): ExecutionContext {
  const {
    type = 'http',
    method = 'GET',
    query = {},
    statusCode = 200,
    controllerPath,
    handlerPath,
  } = options;

  // Real Reflect.defineMetadata/getMetadata, exercised the same way
  // Nest's own @Controller()/@Get() decorators populate it — not a
  // jest.spyOn stand-in — so this test proves the interceptor reads the
  // exact metadata shape Nest produces.
  const controllerMarker = function ControllerMarker() {};
  const handlerMarker = function HandlerMarker() {};
  if (controllerPath !== undefined) {
    Reflect.defineMetadata(PATH_METADATA, controllerPath, controllerMarker);
  }
  if (handlerPath !== undefined) {
    Reflect.defineMetadata(PATH_METADATA, handlerPath, handlerMarker);
  }

  const request = { method, query };
  const response = { statusCode };

  return {
    getType: () => type,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getClass: () => controllerMarker,
    getHandler: () => handlerMarker,
  } as unknown as ExecutionContext;
}

function buildHandler(value: unknown = { ok: true }): CallHandler {
  return { handle: () => of(value) };
}

function buildPageViewServiceMock() {
  return { recordView: jest.fn() } as unknown as PageViewService;
}

describe('PageViewInterceptor', () => {
  it('records a real GET request to a matched, non-denylisted route', async () => {
    const pageViewService = buildPageViewServiceMock();
    const interceptor = new PageViewInterceptor(pageViewService);
    const context = buildContext({ controllerPath: 'posts', handlerPath: ':id' });

    await lastValueFrom(interceptor.intercept(context, buildHandler()));

    expect(pageViewService.recordView).toHaveBeenCalledWith('/posts/:id');
  });

  it('joins a bare @Get() (handler path "/") with its controller prefix correctly', async () => {
    const pageViewService = buildPageViewServiceMock();
    const interceptor = new PageViewInterceptor(pageViewService);
    const context = buildContext({ controllerPath: 'notifications', handlerPath: '/' });

    await lastValueFrom(interceptor.intercept(context, buildHandler()));

    expect(pageViewService.recordView).toHaveBeenCalledWith('/notifications');
  });

  it('does NOT record a non-GET request (POST/PATCH/DELETE are actions, not page loads)', async () => {
    const pageViewService = buildPageViewServiceMock();
    const interceptor = new PageViewInterceptor(pageViewService);
    const context = buildContext({ method: 'POST', controllerPath: 'posts', handlerPath: '/' });

    await lastValueFrom(interceptor.intercept(context, buildHandler()));

    expect(pageViewService.recordView).not.toHaveBeenCalled();
  });

  it.each(['/health', '/auth/refresh', '/admin/auth/refresh', '/notifications/unread-count'])(
    'does NOT record a denylisted route (%s)',
    async (route) => {
      const pageViewService = buildPageViewServiceMock();
      const interceptor = new PageViewInterceptor(pageViewService);
      const [controllerPath, ...rest] = route.replace(/^\//, '').split('/');
      const context = buildContext({ controllerPath, handlerPath: rest.join('/') || '/' });

      await lastValueFrom(interceptor.intercept(context, buildHandler()));

      expect(pageViewService.recordView).not.toHaveBeenCalled();
    },
  );

  it('does NOT record a request carrying a `cursor` query param (a "load more" continuation, not a fresh page load)', async () => {
    const pageViewService = buildPageViewServiceMock();
    const interceptor = new PageViewInterceptor(pageViewService);
    const context = buildContext({
      controllerPath: 'clubs',
      handlerPath: '/',
      query: { cursor: 'abc123' },
    });

    await lastValueFrom(interceptor.intercept(context, buildHandler()));

    expect(pageViewService.recordView).not.toHaveBeenCalled();
  });

  it('DOES record the first page of a list endpoint (no cursor present)', async () => {
    const pageViewService = buildPageViewServiceMock();
    const interceptor = new PageViewInterceptor(pageViewService);
    const context = buildContext({ controllerPath: 'clubs', handlerPath: '/', query: { limit: '20' } });

    await lastValueFrom(interceptor.intercept(context, buildHandler()));

    expect(pageViewService.recordView).toHaveBeenCalledWith('/clubs');
  });

  it('does NOT record a request whose handler responded with a non-2xx status code', async () => {
    const pageViewService = buildPageViewServiceMock();
    const interceptor = new PageViewInterceptor(pageViewService);
    const context = buildContext({ controllerPath: 'clubs', handlerPath: ':id', statusCode: 404 });

    await lastValueFrom(interceptor.intercept(context, buildHandler()));

    expect(pageViewService.recordView).not.toHaveBeenCalled();
  });

  it('does NOT record a request whose handler threw (the Observable errors, never emits next)', async () => {
    const pageViewService = buildPageViewServiceMock();
    const interceptor = new PageViewInterceptor(pageViewService);
    const context = buildContext({ controllerPath: 'clubs', handlerPath: ':id' });
    const failingHandler: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    await expect(lastValueFrom(interceptor.intercept(context, failingHandler))).rejects.toThrow('boom');

    expect(pageViewService.recordView).not.toHaveBeenCalled();
  });

  it('skips entirely for a non-HTTP execution context, never touching getClass()/getHandler()', async () => {
    const pageViewService = buildPageViewServiceMock();
    const interceptor = new PageViewInterceptor(pageViewService);
    const context = {
      getType: () => 'rpc',
      getClass: () => {
        throw new Error('should never be called for a non-HTTP context');
      },
      getHandler: () => {
        throw new Error('should never be called for a non-HTTP context');
      },
      switchToHttp: () => {
        throw new Error('should never be called for a non-HTTP context');
      },
    } as unknown as ExecutionContext;

    const result = await lastValueFrom(interceptor.intercept(context, buildHandler('rpc-result')));

    expect(result).toBe('rpc-result');
    expect(pageViewService.recordView).not.toHaveBeenCalled();
  });

  it('passes the handler response through unchanged (never mutates the response)', async () => {
    const pageViewService = buildPageViewServiceMock();
    const interceptor = new PageViewInterceptor(pageViewService);
    const context = buildContext({ controllerPath: 'clubs', handlerPath: '/' });
    const payload = { items: [1, 2, 3] };

    const result = await lastValueFrom(interceptor.intercept(context, buildHandler(payload)));

    expect(result).toBe(payload);
  });
});
