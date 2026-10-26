/**
 * Who sees a message to one person: only them (the default), or the whole group too
 * (it then shows in the group's feed). Encouraging someone in front of the community.
 */
export default function WhoSees({ name, groupSees, onChange }: { name: string; groupSees: boolean; onChange: (groupSees: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-left text-sm">
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500" checked={groupSees} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Let the group see this too
        <span className="muted block text-xs">{groupSees ? `${name} and the whole group will see it in the feed.` : `Only ${name} will see it.`}</span>
      </span>
    </label>
  )
}
