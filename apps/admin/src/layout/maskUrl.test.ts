import { describe, it, expect } from "vitest";
import { maskUrl } from "./AdminShell";

// R105: in a production build Vite inlines the nav SVGs as data: URIs with single quotes and parentheses. An unquoted
// url() with those is invalid CSS and the mask is dropped (solid squares). The URL must always be quoted.
describe("maskUrl", () => {
  const inlined =
    "data:image/svg+xml,%3csvg%20style='display:%20block;'%20fill='none'%3e%3cpath%20d='M1%201'%20clip-path='url(%23a)'/%3e%3c/svg%3e";

  it("double-quotes a data URI with quotes and parentheses", () => {
    expect(maskUrl(inlined)).toBe(`url("${inlined}")`);
  });

  it("is a valid declaration for the browser CSS parser", () => {
    const el = document.createElement("span");
    el.style.setProperty("mask-image", maskUrl(inlined));
    el.style.setProperty("-webkit-mask-image", maskUrl(inlined));
    expect(el.style.getPropertyValue("mask-image") || el.style.getPropertyValue("-webkit-mask-image")).not.toBe("");
  });

  it("quotes a plain asset path too", () => {
    expect(maskUrl("/assets/nav-users-abc.svg")).toBe('url("/assets/nav-users-abc.svg")');
  });
});
