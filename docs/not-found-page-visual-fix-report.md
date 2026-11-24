# 404 page visual fix (against Figma F-1 to F-4)

Files: `apps/web/src/pages/NotFoundPage.css`, `NotFoundPage.tsx` (one wrapper `div.not-found__column` added; no string, link, h1 count or aria-hidden change). Figma frames read: F-1 `7141:70207` (design context and screenshot). F-2 and the four signed-in state frames were NOT read separately; mobile values come from the founder's list, and the list matched F-1 on every desktop value I could check.

| Item | Old | New |
|---|---|---|
| Alignment | left (`align-items: flex-start`) | centred column and `text-align: center` |
| Container padding | 48px 0 / 24px 0 mobile | 140px 40px 180px / 72px 20px 96px at 820px or less; `margin: -32px` cancels the AppShell 32px content padding so the frame spacing starts at the navbar |
| Column | max-width 560 | width 560, `max-width: 100%`; full width on mobile |
| Gap | 16 | 24 desktop, 20 mobile |
| Label "404" | 700, 0.08em | 600, 14px, 2px |
| Heading | 700 32px/1.2 (26 mobile) | 800 40/48 (28/34 mobile) |
| Body | Inter 400 16/1.5 | Montserrat 500 16/26 (15/23 mobile) |
| Button | min-height 48, padding 0 24, radius 8, `#fff` | padding 16px 32px (52px high), radius 12, full width on mobile, `var(--sn-text-on-navy, #fff)` |
| Links | 14px/500, text-primary, gap 24 | 15px/600, brand navy, underlined, gap 32, centred |

Tokens: `--sn-text-secondary`, `--sn-text-primary`, `--sn-brand-navy`. `--sn-text-on-navy` does not exist in apps/web (many files note this); I used the fallback pattern already in `CommunityMessages.css`, so white shows today and the token is used if it is added. No shared 52px primary-button class exists, so the class stays local.

Shell: the same markup serves the router splat (under FooterLayout, which adds the footer), the blocked profile and the missing post inside AppShell; the negative margin removes the shell padding in all of them.

Checked: typecheck, eslint on the file, build and web tests (see PR description for numbers). Not verified: no browser screenshots taken or compared with F-1 to F-4 (no headless run here); widths 1440 and 390 are inferred from CSS, the breakpoint stays 820px. Founder should check on staging: centring, heading size, button size and corners, spacing above and below, footer on an unknown URL, and `/users/<unknown id>` signed in (no doubled top spacing).

Decision Log: dated note appended to the #565 row in the docx (no register edit; the register has no #565 row to change).
