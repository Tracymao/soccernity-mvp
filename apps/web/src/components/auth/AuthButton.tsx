// Primary CTA button for the auth flow. Same navy-fill treatment as the
// site Header's Login button (src/layout/Header.css .sn-header__login-button)
// for brand consistency, sized to match the Figma "Button" node (e.g.
// 409:1276) instead.
import type { ButtonHTMLAttributes } from "react";
import "./Auth.css";

interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export default function AuthButton({ loading, disabled, children, ...rest }: AuthButtonProps) {
  return (
    <button className="sn-auth-button" disabled={disabled || loading} {...rest}>
      {loading ? "Please wait…" : children}
    </button>
  );
}
