export function makeUserLink(
  id: string,
  action:
    | "self"
    | "update"
    | "delete"
    | "changeEmail"
    | "changePassword"
    | "changeUsername",
) {
  const base = `/user/${id}`;
  switch (action) {
    case "self":
      return { href: base, method: "GET" };
    case "update":
      return { href: base, method: "PUT" };
    case "delete":
      return { href: base, method: "DELETE" };
    case "changeEmail":
      return { href: `${base}/change-email`, method: "POST" };
    case "changePassword":
      return { href: `${base}/change-password`, method: "POST" };
    case "changeUsername":
      return { href: `${base}/change-username`, method: "POST" };
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

export function makeNoteLink(id: string, action: "self" | "update" | "delete") {
  const base = `/note/${id}`;
  switch (action) {
    case "self":
      return { href: base, method: "GET" };
    case "update":
      return { href: base, method: "PUT" };
    case "delete":
      return { href: base, method: "DELETE" };
  }
}
