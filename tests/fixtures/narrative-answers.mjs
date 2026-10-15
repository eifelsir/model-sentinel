export const narrativeAnswers = [
  {
    name: 'candy answer with uncertain cases in the proof',
    expected: '21',
    text: String.raw`最少取出 **21 颗**。关键是可以凭手感选择糖果的形状。

先摸出 **12 颗五角星形糖果**：

- 非苹果味的五角星形糖只有 \(6+4=10\) 颗，因此一定有苹果味。
- 非桃子味的五角星形糖只有 \(7+4=11\) 颗，因此一定有桃子味。

再摸出 **9 颗圆形糖果**。圆形西瓜味只有 8 颗，所以这 9 颗中一定有苹果味或桃子味，便能与已经摸出的另一种口味的五角星形糖配对。

因此，\(12+9=\boxed{21}\) 颗足够。

还需说明为什么 20 颗不能保证。设其中圆形糖有 \(r\) 颗，五角星形糖有 \(20-r\) 颗：

| 圆形糖数量 | 可能出现的不满足要求的情况 |
|---|---|
| \(r\le 8\) | 圆形糖全部是西瓜味 |
| \(9\le r\le15\) | 两种形状都只摸到苹果味和西瓜味：圆形共有 \(7+8=15\) 颗可供摸取，五角星形共有 \(7+4=11\) 颗可供摸取，数量都足够 |
| \(r\ge16\) | 五角星形糖至多 4 颗，可能全部是西瓜味 |

所以，20 颗仍可能无法配对，最少需要 **21 颗**。`,
  },
  {
    name: 'height answer with units and a nested LaTeX box',
    expected: '46.24',
    text: String.raw`The average adult height is **46.24 inches**, accounting for both whether the father supplies milk and whether the offspring can digest it.

Let \(q\) be the frequency of allele \(0\). Under Hardy–Weinberg equilibrium,
\[
q^2=\frac12
\quad\Rightarrow\quad
q=\frac{1}{\sqrt2}.
\]

An offspring receives the height benefit only if its father is not \(0/0\) and the offspring itself is not \(0/0\). Each has probability \(1/2\) of being \(0/0\), but these events are correlated.

If the father is \(0/0\), he always transmits allele \(0\). With random mating, the mother transmits allele \(0\) with probability \(q\). Thus,
\[
P(\text{father }0/0,\ \text{offspring }0/0)
=\frac12q.
\]

By inclusion–exclusion, the fraction of offspring able to obtain and digest milk is
\[
1-\frac12-\frac12+\frac12q
=\frac{1}{2\sqrt2}
\approx0.3535534.
\]

The average heights without and with milk are \(42\) and \(54\) inches, respectively. Therefore,
\[
\overline h
=42+12\left(\frac{1}{2\sqrt2}\right)
=46.2426407\ldots
=\boxed{46.24\text{ inches}}.
\]`,
  },
  {
    name: 'latest candy answer with a compound quantity verb',
    expected: '21',
    text: String.raw`最少需要取出 **21 个**。这里可以利用题目中“靠手感分辨形状”的条件，有选择地摸取两种形状的糖果。

**先证明取 21 个一定够：**

取 **12 个五角星形糖果和 9 个圆形糖果**。

- 五角星形的苹果味与西瓜味一共只有 \(7+4=11\) 个，所以取出的 12 个五角星形糖果中，必有桃子味。
- 五角星形的桃子味与西瓜味一共只有 \(6+4=10\) 个，所以其中也必有苹果味。
- 圆形的西瓜味只有 8 个，所以取出的 9 个圆形糖果中，必有苹果味或桃子味。

因此，无论圆形中出现的是苹果味还是桃子味，都能与五角星形中的另一种口味配对，满足要求。

**再证明 20 个不能保证：**

考虑这样一种最不利的摸取顺序：无论什么时候选择某种形状，该形状的糖果都按以下顺序被摸出：

| 形状 | 最先摸出 | 接着摸出 | 最后摸出 |
|---|---|---|---|
| 圆形 | 8 个西瓜味 | 7 个苹果味 | 9 个桃子味 |
| 五角星形 | 4 个西瓜味 | 7 个苹果味 | 6 个桃子味 |

在这种情况下：

- 想得到“圆形苹果味＋五角星形桃子味”，至少要摸出 \(9+12=21\) 个；
- 想得到“圆形桃子味＋五角星形苹果味”，至少要摸出 \(16+5=21\) 个。

所以，即使摸取过程中可以随时调整所选形状，取 20 个仍可能无法满足要求。

故答案为 \(\boxed{21\text{ 个}}\)。`,
  },
];
