// Dal motivo che il motore prevedeva alla causa che l'operatore può confermare (config/scenario.yaml, console.cause).

/** La causa che il motore si aspettava, tra quelle che l'operatore può scegliere: si parte da qui. */
export function causaSuggerita(motivo: string, cause: string[]) {
  const m = motivo.toLowerCase()
  const regole: [string, string][] = [
    ['attravers', 'Pedoni'],
    ['doppia fila', 'Doppia fila'],
    ['scuola', 'Uscita scuola'],
    ['gps', 'GPS'],
    ['pioggia', 'Pioggia'],
    ['sottopasso', 'Pioggia'],
    ['sole', 'Pioggia'],
  ]
  const r = regole.find(([chiave]) => m.includes(chiave))
  return cause.find((c) => r && c.startsWith(r[1])) ?? cause.at(-1) ?? 'Altro'
}
