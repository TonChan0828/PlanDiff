import { reportClientError } from "@/lib/monitoring/client";

window.addEventListener("error", (event) =>
  reportClientError(event.error, "window"),
);
window.addEventListener("unhandledrejection", (event) =>
  reportClientError(event.reason, "unhandledrejection"),
);
