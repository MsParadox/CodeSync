import { Problem } from '../models/Problem.js';
import { logger } from '../utils/logger.js';

// ── Generic stdin/stdout starter scaffolds (same for every problem) ─
const SCAFFOLDS = {
  javascript: `const lines = require('fs').readFileSync(0, 'utf8').split('\\n');\n// read from \`lines\`, then console.log(answer)\n`,
  typescript: `const lines = require('fs').readFileSync(0, 'utf8').split('\\n');\n// read from \`lines\`, then console.log(answer)\n`,
  python: `import sys\ndata = sys.stdin.read().split()\n# use data[...], then print(answer)\n`,
  cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // read from cin, then cout << answer << "\\n";\n    return 0;\n}\n`,
  java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // read with sc, then System.out.println(answer);\n    }\n}\n`,
  go: `package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\t_ = reader\n\t// read input, then fmt.Println(answer)\n}\n`,
  rust: `use std::io::{self, Read};\n\nfn main() {\n    let mut s = String::new();\n    io::stdin().read_to_string(&mut s).unwrap();\n    // parse s, then println!("{}", answer);\n}\n`,
};

const PROBLEMS = [
  {
    slug: 'a-plus-b', title: 'A + B', difficulty: 'Easy', tags: ['math', 'implementation'], order: 1,
    statement: 'Given two integers **a** and **b**, output their sum.',
    inputFormat: 'A single line with two space-separated integers `a` and `b`.',
    outputFormat: 'A single integer — the sum `a + b`.',
    constraints: '-10^9 ≤ a, b ≤ 10^9',
    samples: [
      { input: '2 3', output: '5', explanation: '2 + 3 = 5' },
      { input: '10 -4', output: '6', explanation: '10 + (-4) = 6' },
    ],
    hiddenTests: [
      { input: '100 200', expectedOutput: '300' },
      { input: '-5 -7', expectedOutput: '-12' },
      { input: '0 0', expectedOutput: '0' },
      { input: '999999999 1', expectedOutput: '1000000000' },
    ],
  },
  {
    slug: 'sum-of-array', title: 'Sum of Array', difficulty: 'Easy', tags: ['arrays', 'implementation'], order: 2,
    statement: 'Read an array of integers and output the sum of all its elements.',
    inputFormat: 'First line: integer `n`. Second line: `n` space-separated integers.',
    outputFormat: 'A single integer — the sum of the array.',
    constraints: '1 ≤ n ≤ 10^5',
    samples: [
      { input: '5\n1 2 3 4 5', output: '15' },
      { input: '3\n-1 0 1', output: '0' },
    ],
    hiddenTests: [
      { input: '4\n10 20 30 40', expectedOutput: '100' },
      { input: '1\n42', expectedOutput: '42' },
      { input: '6\n1 1 1 1 1 1', expectedOutput: '6' },
    ],
  },
  {
    slug: 'reverse-string', title: 'Reverse String', difficulty: 'Easy', tags: ['strings'], order: 3,
    statement: 'Read a single word (no spaces) and print it reversed.',
    inputFormat: 'A single line containing a string of visible characters (no spaces).',
    outputFormat: 'The reversed string.',
    constraints: '1 ≤ length ≤ 1000',
    samples: [
      { input: 'hello', output: 'olleh' },
      { input: 'abc', output: 'cba' },
    ],
    hiddenTests: [
      { input: 'racecar', expectedOutput: 'racecar' },
      { input: 'CodeSync', expectedOutput: 'cnySedoC' },
      { input: 'a', expectedOutput: 'a' },
    ],
  },
  {
    slug: 'fizzbuzz', title: 'FizzBuzz', difficulty: 'Easy', tags: ['implementation', 'simulation'], order: 4,
    statement: 'For each i from 1 to n print **Fizz** if i is divisible by 3, **Buzz** if divisible by 5, **FizzBuzz** if divisible by both, otherwise the number itself — one per line.',
    inputFormat: 'A single integer `n`.',
    outputFormat: '`n` lines as described.',
    constraints: '1 ≤ n ≤ 10^4',
    samples: [
      { input: '5', output: '1\n2\nFizz\n4\nBuzz' },
      { input: '3', output: '1\n2\nFizz' },
    ],
    hiddenTests: [
      { input: '15', expectedOutput: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz' },
      { input: '1', expectedOutput: '1' },
    ],
  },
  {
    slug: 'nth-fibonacci', title: 'Nth Fibonacci', difficulty: 'Easy', tags: ['dp', 'math'], order: 5,
    statement: 'Output the n-th Fibonacci number (0-indexed), where fib(0) = 0 and fib(1) = 1.',
    inputFormat: 'A single integer `n`.',
    outputFormat: 'The n-th Fibonacci number.',
    constraints: '0 ≤ n ≤ 90',
    samples: [
      { input: '0', output: '0' },
      { input: '7', output: '13' },
    ],
    hiddenTests: [
      { input: '1', expectedOutput: '1' },
      { input: '10', expectedOutput: '55' },
      { input: '20', expectedOutput: '6765' },
      { input: '30', expectedOutput: '832040' },
    ],
  },
  {
    slug: 'gcd', title: 'GCD of Two Numbers', difficulty: 'Easy', tags: ['math', 'number-theory'], order: 6,
    statement: 'Output the greatest common divisor of two positive integers a and b.',
    inputFormat: 'A single line with two space-separated integers `a` and `b`.',
    outputFormat: 'A single integer — gcd(a, b).',
    constraints: '1 ≤ a, b ≤ 10^9',
    samples: [
      { input: '12 18', output: '6' },
      { input: '7 13', output: '1' },
    ],
    hiddenTests: [
      { input: '100 80', expectedOutput: '20' },
      { input: '17 17', expectedOutput: '17' },
      { input: '1071 462', expectedOutput: '21' },
    ],
  },
  {
    slug: 'count-primes', title: 'Count Primes', difficulty: 'Medium', tags: ['math', 'sieve'], order: 7,
    statement: 'Output the number of prime numbers less than or equal to n.',
    inputFormat: 'A single integer `n`.',
    outputFormat: 'A single integer — the count of primes ≤ n.',
    constraints: '1 ≤ n ≤ 10^6',
    samples: [
      { input: '10', output: '4', explanation: 'Primes ≤ 10: 2, 3, 5, 7' },
      { input: '2', output: '1' },
    ],
    hiddenTests: [
      { input: '1', expectedOutput: '0' },
      { input: '20', expectedOutput: '8' },
      { input: '50', expectedOutput: '15' },
      { input: '100', expectedOutput: '25' },
    ],
  },
  {
    slug: 'max-subarray', title: 'Maximum Subarray Sum', difficulty: 'Medium', tags: ['dp', 'arrays', 'kadane'], order: 8,
    statement: 'Find the maximum possible sum of a **contiguous, non-empty** subarray (Kadane\'s algorithm).',
    inputFormat: 'First line: integer `n`. Second line: `n` space-separated integers.',
    outputFormat: 'A single integer — the maximum subarray sum.',
    constraints: '1 ≤ n ≤ 10^5',
    samples: [
      { input: '9\n-2 1 -3 4 -1 2 1 -5 4', output: '6', explanation: 'Subarray [4, -1, 2, 1] sums to 6.' },
      { input: '1\n-5', output: '-5' },
    ],
    hiddenTests: [
      { input: '5\n1 2 3 4 5', expectedOutput: '15' },
      { input: '4\n-1 -2 -3 -4', expectedOutput: '-1' },
      { input: '3\n5 -2 5', expectedOutput: '8' },
    ],
  },
];

// Idempotent: only seeds when the collection is empty.
export async function seedProblems() {
  try {
    const count = await Problem.countDocuments();
    if (count > 0) return;
    const docs = PROBLEMS.map((p) => ({ ...p, starterCode: SCAFFOLDS }));
    await Problem.insertMany(docs);
    logger.info(`🌱 Seeded ${docs.length} practice problems`);
  } catch (err) {
    logger.error(`Problem seeding failed: ${err.message}`);
  }
}
