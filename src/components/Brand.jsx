import Icon from "./ui/Icon.jsx";

/* The LECTRA logo: green book mark + wordmark. */
export default function Brand() {
  return (
    <span className="brand">
      <span className="brand__mark">
        <Icon name="book" size={18} />
      </span>
      LECTRA
    </span>
  );
}
