# LexiScene Reading-Level Standards

Updated: 2026-08-07

## Evidence and product interpretation

Exam providers do not all publish a fixed word count for one passage. The application therefore distinguishes public exam facts from product targets derived from published task formats and released-paper conventions.

- CET-4/CET-6: the National Education Examinations Authority syllabus defines the reading structure and the approximate vocabulary expectations commonly cited as 4,500 and 5,500 words. It does not require one fixed passage length.
- Graduate entrance English: the syllabus defines four reading texts and a 5,500-word vocabulary expectation, but not one universal article length. Released English I/II papers use denser academic arguments than CET passages.
- IELTS Academic Reading: the official format is three long texts, 40 questions, and 60 minutes. Public IELTS preparation material describes approximately 2,150-2,750 words across the section, so a single learning passage should normally be in the upper part of this product's range.
- TOEFL iBT: the current ETS format describes Reading tasks and a 30-minute Reading section instead of one fixed passage word count. The learning product keeps a longer academic-passage target so learners can practise sustained explanatory reading.

Public references:

- [IELTS Academic Reading format](https://ielts.org/take-a-test/test-format/ielts-academic-reading)
- [ETS TOEFL iBT content](https://www.ets.org/toefl/test-takers/ibt/about/content.html)
- [National Education Examinations Authority CET site](https://cet.neea.edu.cn/)
- [China Graduate Admissions Information Network](https://yz.chsi.com.cn/)

## Enforced article profiles

All profiles stay within the product-wide 400-1000 word rule. The generator checks actual word count, average sentence length, question count, and prompt-specific lexical/syntactic expectations before inserting an article.

| Label | Article length | Average sentence length | Questions | Product reading target |
| --- | ---: | ---: | ---: | --- |
| CET4 | 400-500 words | 12-18 words | 4 | High-frequency college vocabulary, direct reasoning, concrete context |
| CET6 | 500-620 words | 16-22 words | 4 | Moderate abstraction, news/science/social context, controlled inference |
| 考研 | 600-720 words | 19-26 words | 5 | Academic argument, thesis/evidence, contrast and inference |
| 雅思 | 700-850 words | 18-26 words | 5 | Formal academic prose, cohesion, reference and factual detail |
| 托福 | 750-900 words | 20-28 words | 5 | University-style explanation, cause-effect, examples and rhetorical purpose |

## Publishing state flow

```text
candidate -- AI pre-review + human confirmation --> article pool
article pool -- publish to chosen Beijing date --> daily web page
article pool -- scheduled rotation --> daily web page
```

Only one article of the same difficulty is active for one date. Publishing a replacement returns the previously active article for that difficulty/date to the article pool instead of deleting it.
