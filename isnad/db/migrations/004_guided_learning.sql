CREATE TABLE IF NOT EXISTS learning_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  subject TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'beginner'
    CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_courses_published_position_idx
  ON learning_courses(published, position, title);

CREATE TABLE IF NOT EXISTS learning_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, slug),
  UNIQUE (course_id, position)
);

CREATE TABLE IF NOT EXISTS learning_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES learning_modules(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content_markdown TEXT NOT NULL,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_minutes INTEGER NOT NULL DEFAULT 5 CHECK (estimated_minutes > 0),
  position INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module_id, slug),
  UNIQUE (module_id, position)
);

CREATE INDEX IF NOT EXISTS learning_lessons_module_position_idx
  ON learning_lessons(module_id, position)
  WHERE published = true;

CREATE TABLE IF NOT EXISTS course_enrollments (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS course_enrollments_user_recent_idx
  ON course_enrollments(user_id, last_opened_at DESC);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS lesson_progress_user_updated_idx
  ON lesson_progress(user_id, updated_at DESC);

INSERT INTO learning_courses (
  id, slug, title, description, subject, level, estimated_minutes, position, published
) VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'foundations-of-islam',
    'Foundations of Islam',
    'Build a clear foundation in Islam, īmān, intention, and following revelation.',
    'Foundations',
    'beginner',
    28,
    1,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'prayer-essentials',
    'Prayer Essentials',
    'Study the preparation, structure, timing, and inward focus of the five daily prayers.',
    'Fiqh of Worship',
    'beginner',
    30,
    2,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'hadith-verification-basics',
    'Hadith Verification Basics',
    'Learn how hadith reports are described, sourced, graded, and cited responsibly.',
    'Hadith Sciences',
    'intermediate',
    32,
    3,
    true
  )
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  subject = EXCLUDED.subject,
  level = EXCLUDED.level,
  estimated_minutes = EXCLUDED.estimated_minutes,
  position = EXCLUDED.position,
  published = EXCLUDED.published,
  updated_at = now();

INSERT INTO learning_modules (id, course_id, slug, title, description, position) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'islam-and-iman', 'Islam and Īmān', 'The outward pillars and inward foundations of faith.', 1),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'worship-and-guidance', 'Worship and Guidance', 'Intention, sincerity, and returning to revelation.', 2),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'preparing-for-prayer', 'Preparing for Prayer', 'Purification, prayer times, and readiness.', 1),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'praying-with-care', 'Praying with Care', 'The prayer’s structure and inward attentiveness.', 2),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', 'understanding-reports', 'Understanding Reports', 'Hadith, isnād, matn, and transmission.', 1),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003', 'authentication-and-citation', 'Authentication and Citation', 'Basic grading language and responsible use of evidence.', 2)
ON CONFLICT (id) DO UPDATE SET
  course_id = EXCLUDED.course_id,
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  updated_at = now();

INSERT INTO learning_lessons (
  id, module_id, slug, title, summary, content_markdown, source_refs,
  estimated_minutes, position, published
) VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'meaning-of-islam',
    'The Meaning of Islam',
    'Understand submission to Allah and the central testimony of faith.',
    $lesson$
## Main idea

Islam is submission to Allah through worship, obedience, and sincerity. Its central testimony affirms that none has the right to be worshipped except Allah and that Muhammad ﷺ is His Messenger.

This testimony is not merely a phrase. It establishes who is worshipped and how worship is learned: Allah alone is worshipped, and the Messenger ﷺ is followed.

## Practice

- Learn the meaning of the shahādah, not only its pronunciation.
- Review whether worship, hope, fear, reliance, and supplication are directed to Allah alone.
- Treat obedience to Prophet Muhammad ﷺ as part of accepting his message.

## Check yourself

Can you explain the two parts of the shahādah in your own words?
$lesson$,
    '[{"label":"Qur’an 3:19","type":"quran","locator":"3:19"},{"label":"Qur’an 3:85","type":"quran","locator":"3:85"}]'::jsonb,
    6,
    1,
    true
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'five-pillars',
    'The Five Pillars',
    'Learn the five outward foundations on which Islamic practice is built.',
    $lesson$
## Main idea

The five pillars organize the essential outward duties of Islam:

1. The testimony of faith.
2. Establishing the prayer.
3. Giving zakāh.
4. Fasting Ramadan.
5. Performing ḥajj for the one who is able.

The pillars are connected. The testimony gives direction, prayer structures the day, zakāh purifies wealth, fasting trains restraint, and ḥajj gathers Muslims in worship of Allah.

## Practice

Write one sentence explaining the purpose of each pillar. Distinguish between knowing a pillar and consistently living by it.
$lesson$,
    '[{"label":"Sahih al-Bukhari 8","type":"hadith","locator":"Bukhari 8"},{"label":"Sahih Muslim 16a","type":"hadith","locator":"Muslim 16a"}]'::jsonb,
    7,
    2,
    true
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    'foundations-of-iman',
    'The Foundations of Īmān',
    'Recognize the six matters of faith explained in the hadith of Jibrīl.',
    $lesson$
## Main idea

The hadith of Jibrīl distinguishes Islam, īmān, and iḥsān. Īmān includes belief in:

- Allah.
- His angels.
- His books.
- His messengers.
- The Last Day.
- Divine decree, its good and its difficult aspects.

These beliefs form one connected worldview. They explain where guidance comes from, why human life is accountable, and how a believer understands what is seen and unseen.

## Practice

For each article of faith, write one practical effect it should have on character or worship.
$lesson$,
    '[{"label":"Qur’an 2:177","type":"quran","locator":"2:177"},{"label":"Sahih Muslim 8a","type":"hadith","locator":"Muslim 8a"}]'::jsonb,
    7,
    3,
    true
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000002',
    'intention-and-revelation',
    'Intention and Following Revelation',
    'Connect sincere intention with correct guidance from the Qur’an and Sunnah.',
    $lesson$
## Main idea

A deed needs a sincere intention and a sound method. Intention answers **why** an act is done. Revelation teaches **how** Allah is to be obeyed.

The opening hadith of Sahih al-Bukhari teaches that deeds are judged according to intentions. The Qur’an commands believers to obey Allah and the Messenger and to return disagreements to revelation.

Good intentions do not make every method correct, and outward correctness without sincerity is spiritually deficient.

## Practice

Before a beneficial action, pause and identify:

1. The intention.
2. The evidence or sound guidance for the action.
3. The way to perform it without showing off or harming others.
$lesson$,
    '[{"label":"Qur’an 4:59","type":"quran","locator":"4:59"},{"label":"Sahih al-Bukhari 1","type":"hadith","locator":"Bukhari 1"}]'::jsonb,
    8,
    1,
    true
  ),
  (
    '30000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000003',
    'purification-before-prayer',
    'Purification Before Prayer',
    'Understand why purification is part of preparing to stand before Allah.',
    $lesson$
## Main idea

The Qur’an gives the foundation of wuḍūʾ: washing the face and arms, wiping the head, and washing the feet. It also addresses full ritual impurity and the concession of tayammum when water cannot be used or found under the stated conditions.

Purification is both a legal preparation and a disciplined transition into worship. Details such as invalidators and exceptional circumstances should be learned carefully, with recognized scholarly differences stated rather than hidden.

## Practice

Review the steps of wuḍūʾ from a reliable teacher, then perform them calmly and without wasting water.
$lesson$,
    '[{"label":"Qur’an 5:6","type":"quran","locator":"5:6"}]'::jsonb,
    7,
    1,
    true
  ),
  (
    '30000000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000003',
    'prayer-times-and-readiness',
    'Prayer Times and Readiness',
    'Learn to treat each obligatory prayer as a timed appointment.',
    $lesson$
## Main idea

The obligatory prayers are prescribed at appointed times. A Muslim therefore plans around prayer rather than treating it as an afterthought.

Readiness includes knowing the local prayer time, being purified, covering what must be covered, facing the qiblah when able, and finding a suitable place.

Travel, illness, danger, and other hardships have recognized rulings and concessions. Those details should be learned from qualified instruction rather than guessed.

## Practice

Set a simple preparation routine: check the time, make wuḍūʾ early when practical, and remove avoidable distractions before the prayer begins.
$lesson$,
    '[{"label":"Qur’an 4:103","type":"quran","locator":"4:103"}]'::jsonb,
    7,
    2,
    true
  ),
  (
    '30000000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000004',
    'structure-of-prayer',
    'The Structure of Prayer',
    'Trace the prayer from opening takbīr to the final salām.',
    $lesson$
## Main idea

At a high level, the prayer includes intention, the opening takbīr, standing and recitation when able, bowing, rising, prostration, sitting, testimony, and salām.

The Prophet ﷺ instructed his Companions to pray as they had seen him pray. The detailed descriptions of his prayer are therefore central evidence. Some details have recognized juristic differences, while the core structure is established.

## Practice

Do not rush to collect isolated clips. Learn one complete, sourced description of the prayer, then compare legitimate differences without turning them into arguments.
$lesson$,
    '[{"label":"Sahih al-Bukhari 631","type":"hadith","locator":"Bukhari 631"}]'::jsonb,
    9,
    1,
    true
  ),
  (
    '30000000-0000-4000-8000-000000000008',
    '20000000-0000-4000-8000-000000000004',
    'khushu-and-consistency',
    'Khushūʿ and Consistency',
    'Develop humility, attention, and steadiness in prayer.',
    $lesson$
## Main idea

The Qur’an praises believers who are humble and attentive in their prayer. Khushūʿ includes inward humility and outward calm, though concentration naturally rises and falls.

Consistency is built through preparation, understanding what is recited, avoiding haste, and returning attention whenever it wanders. The goal is not theatrical emotion but sincere presence before Allah.

## Practice

Choose one improvement for the next week: arrive earlier, understand one supplication, slow the transitions, or remove one recurring distraction.
$lesson$,
    '[{"label":"Qur’an 23:1–2","type":"quran","locator":"23:1-2"}]'::jsonb,
    7,
    2,
    true
  ),
  (
    '30000000-0000-4000-8000-000000000009',
    '20000000-0000-4000-8000-000000000005',
    'hadith-isnad-and-matn',
    'Hadith, Isnād, and Matn',
    'Distinguish the report’s chain from its transmitted wording or meaning.',
    $lesson$
## Main idea

A hadith report is studied through two major parts:

- **Isnād:** the chain of people who transmitted the report.
- **Matn:** the reported wording or content.

Scholars examine both. A chain is not accepted merely because names are listed, and a pleasing meaning does not automatically prove that the Prophet ﷺ said it.

A statement may also be traced to a Companion or later scholar rather than to the Prophet ﷺ. Responsible citation identifies that distinction.

## Practice

Whenever you see a religious quote, ask: Who said it? Where is it recorded? How was it graded?
$lesson$,
    '[{"label":"Qur’an 49:6","type":"quran","locator":"49:6"}]'::jsonb,
    8,
    1,
    true
  ),
  (
    '30000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000005',
    'transmission-and-sources',
    'Transmission and Source Priority',
    'Understand why original collections and identifiable references matter.',
    $lesson$
## Main idea

Hadith research begins by locating the report in a recognized collection. Sahih al-Bukhari and Sahih Muslim receive the highest general priority among Sunni hadith collections, while reports in other works require attention to grading and context.

A website can help locate a report, but the website is not the original source. The citation should identify the collection, book or hadith number when verified, narrator when known, and relevant grading.

## Practice

Take one hadith you know and write a complete reference for it. Separate the original collection from the website or app used to find it.
$lesson$,
    '[{"label":"Islamic Teacher source hierarchy","type":"methodology","locator":"Hadith source priority"}]'::jsonb,
    8,
    2,
    true
  ),
  (
    '30000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000006',
    'basic-grading-language',
    'Basic Grading Language',
    'Use common authenticity terms without overstating certainty.',
    $lesson$
## Main idea

Common grading labels include:

- **Ṣaḥīḥ:** authentic according to the relevant hadith criteria.
- **Ḥasan:** acceptable, with a lower strength than ṣaḥīḥ in common usage.
- **Ḍaʿīf:** weak; it should not be presented as established proof.
- **Mawḍūʿ:** fabricated.

A grade belongs to a specific route, report, or scholarly judgment. Different chains may affect the overall assessment, and specialists can disagree. Never upgrade a report because its message sounds beneficial.

## Practice

Replace vague phrases such as “there is a hadith” with a specific source and a clearly stated grade.
$lesson$,
    '[{"label":"Islamic Research Assistant methodology","type":"methodology","locator":"Hadith authentication"}]'::jsonb,
    8,
    1,
    true
  ),
  (
    '30000000-0000-4000-8000-000000000012',
    '20000000-0000-4000-8000-000000000006',
    'responsible-citation',
    'Responsible Citation',
    'Build a repeatable checklist for evidence-based Islamic answers.',
    $lesson$
## Main idea

A responsible Islamic answer should:

1. Identify the exact question.
2. Search the Qur’an first where relevant.
3. Locate authentic Sunnah.
4. Distinguish Prophetic reports from Companion statements.
5. Represent legitimate scholarly disagreement fairly.
6. State the level of certainty.
7. Avoid invented quotations, chains, and references.

High-stakes personal matters require qualified scholarly review with the complete facts.

## Practice

Before sharing an answer, run a final audit: Is every verse correct? Is every hadith source verified? Is disagreement represented fairly? Are unsupported claims removed?
$lesson$,
    '[{"label":"Islamic Research Assistant internal audit","type":"methodology","locator":"Citation verification checklist"}]'::jsonb,
    8,
    2,
    true
  )
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id,
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  content_markdown = EXCLUDED.content_markdown,
  source_refs = EXCLUDED.source_refs,
  estimated_minutes = EXCLUDED.estimated_minutes,
  position = EXCLUDED.position,
  published = EXCLUDED.published,
  updated_at = now();
