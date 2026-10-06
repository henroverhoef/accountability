/** An on/off switch with a label (a styled checkbox, so screen readers understand it). */
export default function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
      <span>{label}</span>
      <input type="checkbox" role="switch" className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-300 transition before:block before:h-5 before:w-5 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:shadow before:transition checked:bg-emerald-500 checked:before:translate-x-5.5 dark:bg-slate-700"
        checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}
