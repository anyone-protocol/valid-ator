export default function (timestamp: number) {
  const [ date ] = new Date(timestamp)
      .toISOString()
      .split('T')

  return date
}
