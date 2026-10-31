import { useField } from "formik";
import TextField from "./TextField.jsx";

export default function FormikTextField({ name, onChange, ...props }) {
  const [field, meta] = useField(name);

  function handleChange(event) {
    field.onChange(event);
    onChange?.(event);
  }

  return (
    <TextField
      {...props}
      {...field}
      value={field.value ?? ""}
      onChange={handleChange}
      error={meta.touched ? meta.error : ""}
    />
  );
}
