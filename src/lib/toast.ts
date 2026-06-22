import { toast as sonner } from "sonner";

type ToastOpts = {
  id?: string;
  description?: string;
};

export function showError(message: string, opts?: ToastOpts) {
  sonner.error(message, {
    id: opts?.id ?? message,
    description: opts?.description,
    duration: 4500,
  });
}

export function showSuccess(message: string, opts?: ToastOpts) {
  sonner.success(message, {
    id: opts?.id ?? message,
    description: opts?.description,
    duration: 3000,
  });
}

export function showInfo(message: string, opts?: ToastOpts) {
  sonner.info(message, {
    id: opts?.id ?? message,
    description: opts?.description,
    duration: 3500,
  });
}
