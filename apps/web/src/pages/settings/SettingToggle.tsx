// The live "Settings Toggle" (Figma component 5694:8219): a switch, not an image. Off = rail
// in the inactive tone with the knob left; On = green rail with the knob right. State is
// shown by BOTH colour and knob position. Navy knob in both states.
import "./SettingToggle.css";

interface Props {
  /** Id of the element that names this switch. */
  labelledBy: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}

export default function SettingToggle({ labelledBy, checked, disabled, onChange }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className={`setting-toggle${checked ? " setting-toggle--on" : ""}`}
      onClick={onChange}
    >
      <span className="setting-toggle__knob" />
    </button>
  );
}
