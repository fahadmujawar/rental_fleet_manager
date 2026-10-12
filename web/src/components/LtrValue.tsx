// Codes such as asset, plate, chassis and serial numbers read left to right, also in Arabic.
export function LtrValue({ value }: { value: string }) {
  return <bdi dir="ltr">{value}</bdi>
}
