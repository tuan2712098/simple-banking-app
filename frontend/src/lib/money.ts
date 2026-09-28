export function formatVnd(value: string): string {
  const [whole, decimals = ''] = String(value).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimals && !/^0+$/.test(decimals) ? `${grouped},${decimals} VND` : `${grouped} VND`;
}
