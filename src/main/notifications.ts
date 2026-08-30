// OS notifications (issue #2): one intent, one system notification. The
// click is wired by the caller — it shows the window and switches the Host
// bar to the owning Host.
import { Notification } from "electron";
import type { NotificationIntent } from "../shared/host-event-router.js";

export function showNotification(
  intent: NotificationIntent,
  onClick: () => void
): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title: intent.title, body: intent.body });
  notification.on("click", onClick);
  notification.show();
}

/** A one-off warning the user must see, e.g. a hotkey that could not register. */
export function showWarning(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  new Notification({ title, body }).show();
}
