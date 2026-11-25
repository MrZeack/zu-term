// History as returned by the `git_log` and `git_show` commands.
export interface GitCommit {
  hash: string;
  parents: string[];
  author: string;
  time: number;
  refs: string[];
  subject: string;
}

export interface GitLogPage {
  commits: GitCommit[];
  hasMore: boolean;
}

export interface GitCommitDetail {
  body: string;
  diff: string;
  truncated: boolean;
}

// A segment of the graph inside one row: `top` goes from the row's top edge
// to its middle (where the commit dot is), `bottom` from the middle down.
export interface GraphLine {
  from: number;
  to: number;
  color: number;
  part: 'top' | 'bottom';
}

export interface GraphRow {
  column: number;
  color: number;
  lines: GraphLine[];
  width: number;
}

// Lanes hold the commit each column is waiting for. Commits arrive newest
// first with parents after their children (`git log --date-order`).
export function computeGraph(commits: GitCommit[]): GraphRow[] {
  const lanes: (string | null)[] = [];
  const colors: number[] = [];
  let nextColor = 0;
  const freeLane = () => {
    const index = lanes.indexOf(null);
    if (index >= 0) return index;
    lanes.push(null);
    return lanes.length - 1;
  };

  return commits.map((commit) => {
    let column = lanes.indexOf(commit.hash);
    if (column < 0) {
      column = freeLane();
      colors[column] = nextColor++;
    }
    const color = colors[column] ?? 0;
    const lines: GraphLine[] = [];

    lanes.forEach((waiting, index) => {
      if (waiting === null) return;
      const to = waiting === commit.hash ? column : index;
      lines.push({ from: index, to, color: colors[index] ?? 0, part: 'top' });
    });
    lanes.forEach((waiting, index) => {
      if (waiting === commit.hash) lanes[index] = null;
    });

    const [first, ...others] = commit.parents;
    let joins: number | undefined;
    if (first !== undefined) {
      const existing = lanes.indexOf(first);
      if (existing >= 0) joins = existing;
      else lanes[column] = first;
    }
    const fresh = new Set<number>();
    for (const parent of others) {
      if (lanes.includes(parent)) {
        fresh.add(lanes.indexOf(parent));
        continue;
      }
      const index = freeLane();
      lanes[index] = parent;
      colors[index] = nextColor++;
      fresh.add(index);
    }

    lanes.forEach((waiting, index) => {
      if (waiting === null) return;
      if (index === column && joins === undefined) {
        lines.push({ from: column, to: column, color, part: 'bottom' });
      } else if (fresh.has(index)) {
        lines.push({ from: column, to: index, color: colors[index] ?? 0, part: 'bottom' });
      } else {
        lines.push({ from: index, to: index, color: colors[index] ?? 0, part: 'bottom' });
      }
    });
    if (joins !== undefined) lines.push({ from: column, to: joins, color, part: 'bottom' });

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    const width = Math.max(column, ...lines.flatMap((line) => [line.from, line.to])) + 1;
    return { column, color, lines, width };
  });
}

export interface RefBadge {
  label: string;
  kind: 'head' | 'branch' | 'remote' | 'tag';
}

const shortRef = (ref: string) =>
  ref.replace(/^refs\/(heads|remotes|tags)\//, '').replace(/^refs\//, '');

// `%D` with `--decorate=full`: "HEAD -> refs/heads/main",
// "refs/remotes/origin/main", "tag: refs/tags/v1".
export function refBadges(refs: string[]): RefBadge[] {
  return refs.map((ref) => {
    if (ref.startsWith('HEAD -> ')) return { label: shortRef(ref.slice(8)), kind: 'head' };
    if (ref === 'HEAD') return { label: ref, kind: 'head' };
    if (ref.startsWith('tag: ')) return { label: shortRef(ref.slice(5)), kind: 'tag' };
    if (ref.startsWith('refs/remotes/')) return { label: shortRef(ref), kind: 'remote' };
    return { label: shortRef(ref), kind: 'branch' };
  });
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatCommitDate(time: number): string {
  const date = new Date(time * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
