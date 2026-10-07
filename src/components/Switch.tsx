import { useCallback, type InputHTMLAttributes } from "react";

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Checkbox rendered by WebKit as the native macOS switch (the `switch`
 * attribute). React has no typing for it, so it is set on the element.
 */
export function Switch(props: SwitchProps) {
  const markAsSwitch = useCallback((input: HTMLInputElement | null) => {
    input?.setAttribute("switch", "");
  }, []);

  return <input {...props} ref={markAsSwitch} type="checkbox" className="switch" />;
}
