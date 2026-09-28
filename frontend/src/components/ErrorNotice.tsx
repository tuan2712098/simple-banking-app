'use client';

import axios from 'axios';

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = (error as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return 'Có lỗi xảy ra. Bạn thử lại nhé.';
}
