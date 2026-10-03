import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PageViewService } from './page-view.service';
import { PAGE_VIEW_CONTINUATION_QUERY_PARAM, PAGE_VIEW_ROUTE_DENYLIST } from './page-view.constants';

// Registered GLOBALLY via APP_INTERCEPTOR in page-view.module.ts — see
// that file's own comment for why, and README.md for the full "what
// counts as a page view" reasoning (Section 4 doesn't define this
// precisely, so every rule below is a stated judgment call, not an
// obvious default).
//
// apps/web and apps/admin are both client-side-rendered SPAs — neither
// app's own client-side route changes (e.g. navigating from /community to
// /clubs) ever reach this server at all, so there is no literal "page
// load" event to observe here. The best available server-side signal is:
// a GET request to a real, matched Nest route, made by a real client,
// that isn't one of the specific non-navigation cases denylisted below.
// This is a deliberate approximation, not a precise page-view count — see
// README.md's own "Known limitations" section for exactly where it over-
// or under-counts.
@Injectable()
export class PageViewInterceptor implements NestInterceptor {
  constructor(private readonly pageViewService: PageViewService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Only GET — every mutating verb (POST/PATCH/DELETE) is an action, not
    // a page load, per the task's own explicit instruction.
    if (request.method !== 'GET') {
      return next.handle();
    }

    // A "load more" continuation of an already-counted list (Section 5.5's
    // keyset-pagination convention) is not a fresh page load — see
    // page-view.constants.ts.
    if (Object.prototype.hasOwnProperty.call(request.query, PAGE_VIEW_CONTINUATION_QUERY_PARAM)) {
      return next.handle();
    }

    const route = buildRouteTemplate(context);

    if (PAGE_VIEW_ROUTE_DENYLIST.has(route)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          // Only a genuinely successful response counts as a real page
          // load — a request that errored never actually rendered
          // anything. Read AFTER next.handle() resolves, by which point
          // the underlying handler has already set the real status code.
          const response = context.switchToHttp().getResponse<Response>();
          if (response.statusCode >= 200 && response.statusCode < 300) {
            this.pageViewService.recordView(route);
          }
        },
        // No `error` handler here on purpose — a request that threw never
        // reaches a 2xx response, so there is nothing to record, and this
        // interceptor must never itself become a source of errors for a
        // failing request.
      }),
    );
  }
}

// Builds a coarse route TEMPLATE from Nest's own routing metadata (the
// literal @Controller()/@Get() path declarations, dynamic segments
// un-substituted — e.g. "/posts/:id") rather than the raw Express request
// path. This is deliberately framework-level, not
// `request.route`/Express-internals-dependent: ExecutionContext.getClass()/
// getHandler() are guaranteed by Nest regardless of the underlying HTTP
// adapter, and the resulting string is exactly the low-cardinality,
// no-real-ids-baked-in shape the PageView.route column requires by
// construction — no separate ID-stripping/normalization step is needed.
function buildRouteTemplate(context: ExecutionContext): string {
  const controllerPath = normalizePathMetadata(Reflect.getMetadata(PATH_METADATA, context.getClass()));
  const handlerPath = normalizePathMetadata(Reflect.getMetadata(PATH_METADATA, context.getHandler()));

  const segments = [controllerPath, handlerPath]
    .filter((segment): segment is string => Boolean(segment))
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment.length > 0);

  return `/${segments.join('/')}`;
}

function normalizePathMetadata(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}
