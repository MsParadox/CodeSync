// ── Learn hub content (static) ────────────────
// Curated DSA/CP notes + reference links. "View code" deep-links into
// Mohit Sharma's open-source DSA-CP repository.

export const REPO = 'https://github.com/MsParadox/DSA-CP';
export const REPO_BRANCH = 'main';

// Build a GitHub tree URL, encoding each path segment (handles spaces/&).
export function repoUrl(path) {
  if (!path) return REPO;
  const enc = path.split('/').map(encodeURIComponent).join('/');
  return `${REPO}/tree/${REPO_BRANCH}/${enc}`;
}

// ── DSA topics ────────────────────────────────────────────────────
export const DSA_TOPICS = [
  {
    id: 'arrays', name: 'Arrays & Vectors', icon: '🔢', difficulty: 'Easy',
    path: 'C++/Array And Vector',
    summary: 'Contiguous, index-addressable storage — the foundation for almost every other structure. Master traversal, two-pointers, prefix sums and sliding windows here.',
    keyPoints: [
      'Random access in O(1); insert/delete in the middle is O(n).',
      'Two-pointer & sliding-window turn many O(n²) scans into O(n).',
      'Prefix sums answer range-sum queries in O(1) after O(n) build.',
      'Vectors (dynamic arrays) amortise push_back to O(1).',
    ],
    complexity: [
      ['Access', 'O(1)'], ['Search (unsorted)', 'O(n)'],
      ['Insert/Delete (end)', 'O(1) amortised'], ['Insert/Delete (middle)', 'O(n)'],
    ],
    resources: [
      ['Sliding Window — GFG', 'https://www.geeksforgeeks.org/window-sliding-technique/'],
      ['Prefix Sums — CP-Algorithms', 'https://cp-algorithms.com/'],
    ],
  },
  {
    id: 'strings', name: 'Strings', icon: '🔤', difficulty: 'Easy',
    path: 'C/Strings',
    summary: 'Sequences of characters. Pattern matching, hashing and the KMP/Z algorithms unlock efficient substring search.',
    keyPoints: [
      'KMP / Z-function find a pattern in O(n + m).',
      'Polynomial / double hashing compares substrings in O(1).',
      'Tries excel at prefix queries and dictionary lookups.',
    ],
    complexity: [
      ['Naive match', 'O(n·m)'], ['KMP / Z', 'O(n + m)'], ['Hash compare', 'O(1) after O(n)'],
    ],
    resources: [
      ['String Algorithms — CP-Algorithms', 'https://cp-algorithms.com/string/prefix-function.html'],
      ['String Hashing', 'https://cp-algorithms.com/string/string-hashing.html'],
    ],
  },
  {
    id: 'linkedlist', name: 'Linked Lists', icon: '🔗', difficulty: 'Easy',
    path: 'C++/LinkedList',
    summary: 'Nodes connected by pointers. Great for O(1) insertion/deletion when you hold the node, and a classic interview source for pointer manipulation.',
    keyPoints: [
      'Reverse, detect cycles (Floyd), find middle (slow/fast pointers).',
      'No random access — search is O(n).',
      'Doubly-linked lists allow O(1) deletion given a node.',
    ],
    complexity: [['Access', 'O(n)'], ['Insert/Delete (at node)', 'O(1)'], ['Search', 'O(n)']],
    resources: [['Linked List — GFG', 'https://www.geeksforgeeks.org/data-structures/linked-list/']],
  },
  {
    id: 'stack', name: 'Stacks', icon: '🥞', difficulty: 'Easy',
    path: 'C++/Stack',
    summary: 'LIFO structure. Powers expression evaluation, monotonic-stack problems, and the call stack itself.',
    keyPoints: [
      'Monotonic stacks solve "next greater/smaller element" in O(n).',
      'Balanced-parentheses, histogram area, and DFS use stacks.',
    ],
    complexity: [['Push/Pop/Top', 'O(1)']],
    resources: [['Monotonic Stack — GFG', 'https://www.geeksforgeeks.org/introduction-to-monotonic-stack-2/']],
  },
  {
    id: 'queue', name: 'Queues & Deques', icon: '📥', difficulty: 'Easy',
    path: 'C++/Queues',
    summary: 'FIFO structure (and double-ended deques). Backbone of BFS and sliding-window maximum.',
    keyPoints: [
      'BFS explores level-by-level using a queue.',
      'Monotonic deque gives sliding-window max/min in O(n).',
    ],
    complexity: [['Enqueue/Dequeue', 'O(1)']],
    resources: [['Deque — cppreference', 'https://en.cppreference.com/w/cpp/container/deque']],
  },
  {
    id: 'hashing', name: 'Hashing (Maps & Sets)', icon: '🗂️', difficulty: 'Easy',
    path: 'C++/Hash Map',
    summary: 'Key→value in expected O(1). The single most useful tool for "have I seen this before?" problems.',
    keyPoints: [
      'unordered_map/set give average O(1) operations.',
      'Frequency counting, two-sum, grouping, deduplication.',
      'Beware worst-case O(n) with adversarial hashing.',
    ],
    complexity: [['Insert/Find/Erase (avg)', 'O(1)'], ['Worst case', 'O(n)']],
    resources: [['unordered_map — cppreference', 'https://en.cppreference.com/w/cpp/container/unordered_map']],
  },
  {
    id: 'heap', name: 'Heaps & Priority Queues', icon: '⛰️', difficulty: 'Medium',
    path: 'C++/Heaps & Priority Queue',
    summary: 'Complete binary tree maintaining the min/max at the root. Powers Dijkstra, top-K, and scheduling.',
    keyPoints: [
      'Push/pop in O(log n); peek in O(1).',
      'Top-K elements via a size-K heap in O(n log k).',
      'Two heaps maintain a running median.',
    ],
    complexity: [['Peek', 'O(1)'], ['Push/Pop', 'O(log n)'], ['Build', 'O(n)']],
    resources: [['priority_queue — cppreference', 'https://en.cppreference.com/w/cpp/container/priority_queue']],
  },
  {
    id: 'binary-search', name: 'Binary Search', icon: '🎯', difficulty: 'Medium',
    path: 'C++/Binary Search',
    summary: 'Halve the search space each step. Beyond sorted arrays, "binary search on the answer" solves a huge class of optimisation problems.',
    keyPoints: [
      'Works on any monotonic predicate, not just sorted arrays.',
      'lower_bound / upper_bound for first/last positions.',
      'Binary-search-the-answer: minimise the max, maximise the min.',
    ],
    complexity: [['Search', 'O(log n)']],
    resources: [['Binary Search — CP-Algorithms', 'https://cp-algorithms.com/num_methods/binary_search.html']],
  },
  {
    id: 'sorting', name: 'Sorting', icon: '🔀', difficulty: 'Medium',
    path: 'C++/Sorting Algorithms',
    summary: 'Comparison sorts (merge, quick, heap) at O(n log n) and linear-time counting/radix sorts for bounded keys.',
    keyPoints: [
      'Merge sort is stable, O(n log n) worst case.',
      'Quick sort is in-place, fast in practice, O(n²) worst case.',
      'Counting/radix sort beat the comparison lower bound for small keys.',
    ],
    complexity: [['Merge/Heap', 'O(n log n)'], ['Quick (avg)', 'O(n log n)'], ['Counting', 'O(n + k)']],
    resources: [['Sorting — CP-Algorithms', 'https://cp-algorithms.com/']],
  },
  {
    id: 'recursion', name: 'Recursion & Backtracking', icon: '🔁', difficulty: 'Medium',
    path: 'C++/BackTracking',
    summary: 'Solve a problem in terms of smaller instances; backtracking prunes the search tree of permutations, subsets and constraint problems.',
    keyPoints: [
      'Every recursion needs a base case + progress toward it.',
      'Backtracking = choose → explore → un-choose.',
      'Classic: N-Queens, Sudoku, subsets, permutations.',
    ],
    complexity: [['Subsets', 'O(2ⁿ)'], ['Permutations', 'O(n!)']],
    resources: [['Backtracking — GFG', 'https://www.geeksforgeeks.org/backtracking-algorithms/']],
  },
  {
    id: 'trees', name: 'Binary Trees & BST', icon: '🌳', difficulty: 'Medium',
    path: 'C++/Binary Trees',
    summary: 'Hierarchical nodes. BSTs keep keys ordered for O(log n) search; traversals (in/pre/post/level) are bread-and-butter.',
    keyPoints: [
      'In-order traversal of a BST yields sorted keys.',
      'Balanced BSTs (AVL/Red-Black) guarantee O(log n).',
      'LCA, diameter, and path-sum are common interview asks.',
    ],
    complexity: [['Search/Insert (balanced)', 'O(log n)'], ['Traversal', 'O(n)']],
    resources: [
      ['Binary Tree — GFG', 'https://www.geeksforgeeks.org/binary-tree-data-structure/'],
      ['BST — CP-Algorithms', 'https://cp-algorithms.com/data_structures/'],
    ],
  },
  {
    id: 'tries', name: 'Tries & Segment Trees', icon: '🌲', difficulty: 'Hard',
    path: 'C++/Segment Trees',
    summary: 'Tries store strings by shared prefixes; segment trees answer range queries (sum/min/max) with point/range updates in O(log n).',
    keyPoints: [
      'Trie: prefix search, autocomplete, XOR-maximisation.',
      'Segment tree: range query + update in O(log n).',
      'Lazy propagation handles range updates efficiently.',
    ],
    complexity: [['Trie insert/search', 'O(L)'], ['Segtree query/update', 'O(log n)']],
    resources: [['Segment Tree — CP-Algorithms', 'https://cp-algorithms.com/data_structures/segment_tree.html']],
  },
  {
    id: 'graphs', name: 'Graphs', icon: '🕸️', difficulty: 'Hard',
    path: 'C++/Graphs',
    summary: 'Vertices and edges modelling networks. BFS/DFS, shortest paths (Dijkstra/Bellman-Ford), MST (Kruskal/Prim) and topological sort.',
    keyPoints: [
      'BFS = shortest path on unweighted graphs.',
      'Dijkstra (non-negative weights) with a heap is O(E log V).',
      'Union-Find powers Kruskal MST and connectivity.',
      'Topological sort orders a DAG\'s dependencies.',
    ],
    complexity: [['BFS/DFS', 'O(V + E)'], ['Dijkstra', 'O(E log V)'], ['MST', 'O(E log V)']],
    resources: [
      ['Graph Algorithms — CP-Algorithms', 'https://cp-algorithms.com/graph/breadth-first-search.html'],
      ['Dijkstra', 'https://cp-algorithms.com/graph/dijkstra.html'],
    ],
  },
  {
    id: 'dp', name: 'Dynamic Programming', icon: '🧩', difficulty: 'Hard',
    path: 'C++/Dynamic Programming',
    summary: 'Break a problem into overlapping sub-problems and reuse their solutions. The highest-leverage interview/CP topic.',
    keyPoints: [
      'Define a state, a transition, and base cases.',
      'Top-down memoisation vs bottom-up tabulation.',
      'Classics: knapsack, LIS, LCS, edit distance, matrix-chain.',
    ],
    complexity: [['Typical', 'O(states × transitions)']],
    resources: [
      ['DP — CP-Algorithms', 'https://cp-algorithms.com/dynamic_programming/'],
      ['DP for Beginners — Codeforces', 'https://codeforces.com/blog/entry/325'],
    ],
  },
  {
    id: 'greedy', name: 'Greedy', icon: '💰', difficulty: 'Medium',
    path: 'C++/Greedy',
    summary: 'Make the locally optimal choice at each step. Works when a problem has the greedy-choice property and optimal substructure.',
    keyPoints: [
      'Always prove correctness (exchange argument).',
      'Interval scheduling, Huffman coding, fractional knapsack.',
    ],
    complexity: [['Often', 'O(n log n) (sort + scan)']],
    resources: [['Greedy — GFG', 'https://www.geeksforgeeks.org/greedy-algorithms/']],
  },
];

// ── Big-O cheat sheet ─────────────────────────────────────────────
export const BIG_O = [
  { ds: 'Array',           access: 'O(1)', search: 'O(n)',     insert: 'O(n)',     del: 'O(n)' },
  { ds: 'Dynamic Array',   access: 'O(1)', search: 'O(n)',     insert: 'O(1)*',    del: 'O(n)' },
  { ds: 'Linked List',     access: 'O(n)', search: 'O(n)',     insert: 'O(1)',     del: 'O(1)' },
  { ds: 'Hash Table',      access: '—',    search: 'O(1)*',    insert: 'O(1)*',    del: 'O(1)*' },
  { ds: 'BST (balanced)',  access: 'O(log n)', search: 'O(log n)', insert: 'O(log n)', del: 'O(log n)' },
  { ds: 'Heap',            access: 'O(1)†', search: 'O(n)',    insert: 'O(log n)', del: 'O(log n)' },
  { ds: 'Stack / Queue',   access: 'O(n)', search: 'O(n)',     insert: 'O(1)',     del: 'O(1)' },
];

// ── Development documentation ──────────────────────────────────────
export const DEV_DOCS = [
  {
    group: 'Languages', color: '#00d4ff', links: [
      ['C++ — cppreference', 'https://en.cppreference.com/'],
      ['Python', 'https://docs.python.org/3/'],
      ['Java SE', 'https://docs.oracle.com/en/java/'],
      ['JavaScript — MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript'],
      ['TypeScript', 'https://www.typescriptlang.org/docs/'],
      ['Go', 'https://go.dev/doc/'],
      ['Rust', 'https://doc.rust-lang.org/book/'],
    ],
  },
  {
    group: 'Frontend', color: '#c77dff', links: [
      ['React', 'https://react.dev/'],
      ['Redux Toolkit', 'https://redux-toolkit.js.org/'],
      ['Vite', 'https://vitejs.dev/guide/'],
      ['Tailwind CSS', 'https://tailwindcss.com/docs'],
      ['Monaco Editor', 'https://microsoft.github.io/monaco-editor/'],
    ],
  },
  {
    group: 'Backend & Realtime', color: '#00ff9d', links: [
      ['Node.js', 'https://nodejs.org/docs/latest/api/'],
      ['Express', 'https://expressjs.com/'],
      ['Socket.IO', 'https://socket.io/docs/v4/'],
      ['Mongoose', 'https://mongoosejs.com/docs/'],
      ['Redis', 'https://redis.io/docs/latest/'],
      ['Yjs (CRDT)', 'https://docs.yjs.dev/'],
    ],
  },
  {
    group: 'DevOps', color: '#ffd600', links: [
      ['Docker', 'https://docs.docker.com/'],
      ['Nginx', 'https://nginx.org/en/docs/'],
      ['GitHub Actions', 'https://docs.github.com/actions'],
      ['MongoDB Atlas', 'https://www.mongodb.com/docs/atlas/'],
    ],
  },
  {
    group: 'Competitive Programming', color: '#ff6b35', links: [
      ['CP-Algorithms', 'https://cp-algorithms.com/'],
      ['CSES Problem Set', 'https://cses.fi/problemset/'],
      ['USACO Guide', 'https://usaco.guide/'],
      ['Codeforces', 'https://codeforces.com/'],
      ['AtCoder', 'https://atcoder.jp/'],
      ['LeetCode', 'https://leetcode.com/'],
    ],
  },
];
