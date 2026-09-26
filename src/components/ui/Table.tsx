type Props = {
  head: React.ReactNode[];
  children: React.ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  error?: Error;
};

/** Table shell with loading / error / empty states. Rows are plain <tr>s using the `td` class below. */
export function Table({ head, children, loading, empty, emptyText = 'Nothing here yet.', error }: Props) {
  const message = error ? error.message : loading ? 'Loading…' : empty ? emptyText : null;
  return (
    <div className="overflow-x-auto rounded-lg border border-b1 bg-s0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-b1 text-left text-xs uppercase tracking-wide text-t3">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2.5 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-b1">
          {message ? (
            <tr><td colSpan={head.length} className={`px-4 py-10 text-center ${error ? 'text-accent' : 'text-t3'}`}>{message}</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

export const td = 'px-4 py-2.5 whitespace-nowrap';
export const rowLink = 'cursor-pointer hover:bg-s2';
