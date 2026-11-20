// The two fields both report forms share: the reason-category radio group and the description field
// (B-284, Decision Log #465). Figma: in-app form frames 6946:40232 to 6946:40796, public page frames
// 6947:39713 to 6947:40905 (docs/figma-report-reason-categories.md). A radio list, not a select: one tap per
// choice, all nine visible. The labels come from lib/reportReasons.ts.
import { useId } from "react";
import { REPORT_DETAILS_MAX_LENGTH, type ReportReasonCategory } from "../../api/moderation";
import { REPORT_REASON_OPTIONS, detailsRequired } from "../../lib/reportReasons";
import "./ReportFields.css";

interface ReportCategoryFieldProps {
  value: ReportReasonCategory | null;
  onChange: (category: ReportReasonCategory) => void;
  disabled?: boolean;
  /** Focus the first option when the field mounts, e.g. when it opens in a dialog. */
  autoFocus?: boolean;
}

export function ReportCategoryField({ value, onChange, disabled = false, autoFocus = false }: ReportCategoryFieldProps) {
  const name = useId();
  return (
    <fieldset className="report-fields__category" disabled={disabled}>
      <legend className="report-fields__legend">What’s the problem? (choose one)</legend>
      <div className="report-fields__options">
        {REPORT_REASON_OPTIONS.map((option, index) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`report-fields__option${selected ? " report-fields__option--selected" : ""}`}
            >
              <input
                type="radio"
                className="report-fields__radio"
                name={name}
                value={option.value}
                checked={selected}
                autoFocus={autoFocus && index === 0}
                onChange={() => onChange(option.value)}
              />
              <span className="report-fields__option-label">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface ReportDetailsFieldProps {
  category: ReportReasonCategory | null;
  value: string;
  onChange: (value: string) => void;
  /** Placeholder when the description is optional. */
  placeholder: string;
  disabled?: boolean;
}

export function ReportDetailsField({ category, value, onChange, placeholder, disabled = false }: ReportDetailsFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const required = detailsRequired(category);
  return (
    <div className="report-fields__details">
      <label className="report-fields__label" htmlFor={id}>
        {required ? "Details (required)" : "Details (optional)"}
      </label>
      <textarea
        id={id}
        className="report-fields__textarea"
        placeholder={required ? "Tell us what the problem is." : placeholder}
        value={value}
        maxLength={REPORT_DETAILS_MAX_LENGTH}
        required={required}
        disabled={disabled}
        aria-describedby={required ? hintId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {required && (
        <p className="report-fields__hint" id={hintId}>
          Details are required when you choose Other.
        </p>
      )}
      <p className="report-fields__counter" aria-hidden="true">
        {value.length} / {REPORT_DETAILS_MAX_LENGTH}
      </p>
    </div>
  );
}
