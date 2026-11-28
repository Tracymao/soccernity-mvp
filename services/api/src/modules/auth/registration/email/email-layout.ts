// CH-H18: the one branded HTML layout for every outgoing email, measured from the Figma email frames
// (file weZWWqggy9j13eX8bhFgs6, e.g. Welcome 7008:56942). Email-client rules: table layout, inline styles on every
// element, one <style> block that only holds the small-screen media queries, no script, no web fonts, no
// background images, light colour scheme only.
//
// Colours are the two brand colours or navy blended onto white (for clients that ignore alpha):
// #282E65 navy, #6A6E93 (body), #D4D5E0 (divider), #B5B7CB (footer).
import { escapeHtml } from './escape-html';
import { buildWebAppLink } from './web-app-link.util';

export const EMAIL_LOGO_PATH = '/email/soccernity-logo-mark.png';

const NAVY = '#282E65';
const BODY_COLOUR = '#6A6E93';
const DIVIDER_COLOUR = '#D4D5E0';
const FOOTER_COLOUR = '#B5B7CB';
const WHITE = '#FFFFFF';
const FONT = "font-family:Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;";
const WORDMARK_FONT = 'font-family:Montserrat,Arial,sans-serif;';

const TEXT =
  `${FONT}font-size:14px;line-height:28px;letter-spacing:0.25px;color:${BODY_COLOUR};` +
  'text-align:center;word-break:break-word;overflow-wrap:anywhere;';
const PARAGRAPH = `margin:0 0 28px 0;padding:0;${TEXT}`;
const LINK = `color:${NAVY};text-decoration:underline;`;
const STRONG = `font-weight:bold;color:${NAVY};`;
const LIST = `margin:0 0 28px 0;padding:0 0 0 20px;${TEXT}text-align:left;`;
const LIST_ITEM = `margin:0;padding:0;${TEXT}text-align:left;`;
const TABLE = 'role="presentation" border="0" cellpadding="0" cellspacing="0"';

export interface EmailLayoutOptions {
  // Plain text (the subject line); escaped here.
  title: string;
  // The template's own body: bare <p>, <ul>, <li>, <strong>, <a href="..."> and renderEmailButton() output.
  bodyHtml: string;
  // Plain text shown by inbox previews. Defaults to the title, so no new wording is introduced.
  preheader?: string;
  // Plain text under the divider. Only for a template that already ships a footer line.
  footer?: string;
  // From emailLogoUrl(). Without it the wordmark text stands alone, so there is never a broken image.
  logoUrl?: string | null;
}

export function emailLogoUrl(webAppBaseUrl: string | undefined | null): string | null {
  return buildWebAppLink(webAppBaseUrl, EMAIL_LOGO_PATH, {});
}

// A "bulletproof" button: the table cell carries the colour and size, the <a> carries the padding, and
// mso-padding-alt gives Outlook (which ignores padding on a link) the same height. Both arguments are escaped.
export function renderEmailButton(label: string, href: string): string {
  return (
    `<table ${TABLE} width="100%" style="width:100%;border-collapse:collapse;">` +
    `<tr><td align="center" style="padding:0 0 16px 0;">` +
    `<table ${TABLE} width="245" style="width:245px;border-collapse:separate;">` +
    `<tr><td align="center" bgcolor="${NAVY}" height="48" ` +
    `style="background-color:${NAVY};border-radius:0;mso-padding-alt:14px 8px;">` +
    `<a href="${escapeHtml(href)}" style="display:block;padding:14px 8px;${FONT}font-size:14px;` +
    `font-weight:bold;line-height:20px;color:${WHITE};text-decoration:none;">${escapeHtml(label)}</a>` +
    `</td></tr></table>` +
    `</td></tr></table>`
  );
}

// Adds the inline styles to the template's bare tags. Only exact bare forms are matched, so the button (whose <a>
// already has a style) is left alone.
function styleBody(bodyHtml: string): string {
  return bodyHtml
    .replace(/<p>/g, `<p style="${PARAGRAPH}">`)
    .replace(/<ul>/g, `<ul style="${LIST}">`)
    .replace(/<li>/g, `<li style="${LIST_ITEM}">`)
    .replace(/<strong>/g, `<strong style="${STRONG}">`)
    .replace(/<a href="([^"]*)">/g, `<a href="$1" style="${LINK}">`);
}

function renderLogo(logoUrl: string | null | undefined): string {
  const mark = logoUrl
    ? `<td style="padding:0 7px 0 0;vertical-align:middle;">` +
      `<img src="${escapeHtml(logoUrl)}" alt="Soccernity" width="24" height="25" ` +
      `style="display:block;width:24px;height:25px;border:0;outline:none;"></td>`
    : '';
  return (
    `<table ${TABLE} align="center" style="margin:0 auto;border-collapse:collapse;"><tr>` +
    mark +
    `<td style="vertical-align:middle;${WORDMARK_FONT}font-size:16px;font-weight:600;line-height:25px;` +
    `color:${NAVY};">Soccernity</td>` +
    `</tr></table>`
  );
}

export function renderEmailLayout({ title, bodyHtml, preheader, footer, logoUrl }: EmailLayoutOptions): string {
  const safeTitle = escapeHtml(title);
  const footerRow = footer
    ? `<tr><td class="sn-pad" align="center" style="padding:20px 64px 40px 64px;">` +
      `<p style="margin:0;padding:0;${FONT}font-size:12px;line-height:20px;color:${FOOTER_COLOUR};` +
      `text-align:center;">${escapeHtml(footer)}</p></td></tr>`
    : `<tr><td style="padding:0 0 40px 0;font-size:0;line-height:0;">&nbsp;</td></tr>`;

  return (
    `<!doctype html>` +
    `<html lang="en">` +
    `<head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="color-scheme" content="light">` +
    `<meta name="supported-color-schemes" content="light">` +
    `<title>${safeTitle}</title>` +
    `<style>` +
    `@media (max-width:679px){.sn-pad{padding-left:24px !important;padding-right:24px !important;}}` +
    `@media (max-width:480px){.sn-title{font-size:28px !important;line-height:36px !important;}}` +
    `</style>` +
    `</head>` +
    `<body style="margin:0;padding:0;width:100%;background-color:${WHITE};color-scheme:light;">` +
    `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;` +
    `line-height:1px;color:${WHITE};">${escapeHtml(preheader ?? title)}</div>` +
    `<table ${TABLE} width="100%" bgcolor="${WHITE}" ` +
    `style="width:100%;background-color:${WHITE};border-collapse:collapse;">` +
    `<tr><td align="center" style="padding:0;">` +
    // Outlook ignores max-width, so it gets a fixed 680px table of its own.
    `<!--[if mso]><table ${TABLE} width="680" align="center"><tr><td><![endif]-->` +
    `<table ${TABLE} width="100%" style="width:100%;max-width:680px;margin:0 auto;border-collapse:collapse;">` +
    `<tr><td class="sn-pad" align="center" style="padding:56px 64px 24px 64px;">` +
    `<h1 class="sn-title" style="margin:0;padding:0;${FONT}font-size:40px;line-height:72px;font-weight:bold;` +
    `color:${NAVY};text-align:center;word-break:break-word;">${safeTitle}</h1>` +
    `</td></tr>` +
    `<tr><td class="sn-pad" align="center" style="padding:0 64px 8px 64px;${TEXT}">${styleBody(bodyHtml)}</td></tr>` +
    `<tr><td class="sn-pad" align="center" style="padding:0 64px 22px 64px;">${renderLogo(logoUrl)}</td></tr>` +
    `<tr><td class="sn-pad" style="padding:0 48px;">` +
    `<table ${TABLE} width="100%" style="width:100%;border-collapse:collapse;">` +
    `<tr><td style="border-top:1px dashed ${DIVIDER_COLOUR};font-size:0;line-height:0;">&nbsp;</td></tr>` +
    `</table></td></tr>` +
    footerRow +
    `</table>` +
    `<!--[if mso]></td></tr></table><![endif]-->` +
    `</td></tr></table>` +
    `</body>` +
    `</html>`
  );
}
