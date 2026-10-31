import { useEffect, useRef, useState } from "react";

export default function TransientStatus({ children, duration = 3000, onDismiss }) {
  const [visible, setVisible] = useState(true);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setVisible(false);
      onDismissRef.current?.();
    }, duration);

    return () => clearTimeout(timeout);
  }, [duration]);

  return visible ? children : null;
}
