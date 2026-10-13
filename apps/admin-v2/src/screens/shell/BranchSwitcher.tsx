import { Select } from '../../components';
import { switcherModel } from '../../lib/branchDate';
import { useBranchDate } from './BranchDateContext';

/**
 * S1: the global branch switcher (and date) shown under the topbar on branch-scoped screens.
 * Segmented up to 4 branches, a dropdown beyond; hidden for a single-branch manager (their one
 * branch is implied). "All" is offered only on a screen that declares `supportsAllBranches`,
 * only with two or more branches, and is reads-only.
 */
export function BranchSwitcher({ allowAll, showDate }: { allowAll: boolean; showDate: boolean }) {
  const { branches, selection, setSelection, date, today, setDate } = useBranchDate();
  const model = switcherModel(branches, allowAll);
  if (model.kind === 'hidden' && !showDate) return null;

  return (
    <div className="av2-context-bar">
      {model.kind === 'segmented' && (
        <div role="group" aria-label="Branch" className="av2-segmented">
          {model.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className="av2-segmented-btn"
              aria-pressed={selection === o.id}
              onClick={() => setSelection(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {model.kind === 'dropdown' && (
        <div className="av2-context-select">
          <Select label="Branch" value={selection} onChange={(e) => setSelection(e.target.value)}>
            {model.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      )}
      {showDate && (
        <label className="av2-context-date">
          <span>Date</span>
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value || null)} />
        </label>
      )}
    </div>
  );
}
