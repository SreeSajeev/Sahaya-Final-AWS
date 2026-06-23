import { Button } from '@/components/ui/button';
import { Users, X } from 'lucide-react';

interface BulkAssignToolbarProps {
  selectedCount: number;
  assignableCount: number;
  onGroupAssign: () => void;
  onClearSelection: () => void;
}

export function BulkAssignToolbar({
  selectedCount,
  assignableCount,
  onGroupAssign,
  onClearSelection,
}: BulkAssignToolbarProps) {
  if (selectedCount <= 0) return null;

  const hasAssignable = assignableCount > 0;
  const label =
    assignableCount === selectedCount
      ? `${selectedCount} ticket${selectedCount === 1 ? '' : 's'} selected`
      : `${selectedCount} selected (${assignableCount} assignable)`;

  return (
    <div className="sticky bottom-4 z-20 mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onGroupAssign}
          disabled={!hasAssignable}
          className="gap-2"
          title={
            hasAssignable
              ? undefined
              : 'No selected tickets can be bulk-assigned (OPEN or FE_ATTEMPT_FAILED only)'
          }
        >
          <Users className="h-4 w-4" />
          Group &amp; Assign
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClearSelection} className="gap-2">
          <X className="h-4 w-4" />
          Clear Selection
        </Button>
      </div>
    </div>
  );
}
