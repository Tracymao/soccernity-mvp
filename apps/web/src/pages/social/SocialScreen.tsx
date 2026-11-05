// The standalone social sign-in screens share one layout (Figma 6966:46142, 6966:46212, 6966:46289, 6966:46362,
// 6966:46438): a centred 350px column under the logo-only Top Bar, a 24px title, a 14px grey body, then the
// form or buttons. The heading takes focus when a new screen appears so a screen reader announces the change.
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import "./social.css";

interface Props {
  title: string;
  /** One or more paragraphs under the title. */
  body?: ReactNode;
  children?: ReactNode;
}

export default function SocialScreen({ title, body, children }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [title]);

  return (
    <div className="social-screen">
      <div className="social-screen__column">
        <div className="social-screen__header">
          <h1 className="social-screen__title" ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {body}
        </div>
        {children}
      </div>
    </div>
  );
}
