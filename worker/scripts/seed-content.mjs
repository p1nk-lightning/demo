import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseName = 'lexiscene';
const remote = process.argv.includes('--remote');
const skipDictionary = process.argv.includes('--skip-dictionary');
const fetchCovers = !process.argv.includes('--skip-covers');
const dictionaryFile = process.argv.find((value) => value.startsWith('--ecdict-file='))?.slice('--ecdict-file='.length);
const dictionarySize = Number(process.argv.find((value) => value.startsWith('--dictionary-size='))?.slice('--dictionary-size='.length)) || 15000;
const coreDictionarySize = Number(process.argv.find((value) => value.startsWith('--core-dictionary-size='))?.slice('--core-dictionary-size='.length)) || 6000;
const ecdictUrl = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv';
const ecdictSourceUrl = 'https://github.com/skywind3000/ECDICT';
const sqlBatchSize = 100;

const sourceNotes = {
  'bbc-news': '公开 RSS 标题、摘要和链接仅作事实线索，正文是原创改写。',
  nasa: 'NASA 公开资料，正文是面向英语学习的原创改写。',
  'un-news': '公开 RSS 标题、摘要和链接仅作事实线索，正文是原创改写。',
};

const fallbackCovers = {
  科技: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=82',
  文化: 'https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=1400&q=82',
  教育: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=1400&q=82',
  生活: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1400&q=82',
  商业: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1400&q=82',
  自然: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1400&q=82',
  随机: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1400&q=82',
};

const sources = {
  'bbc-news': {
    title: 'BBC News',
    url: 'https://www.bbc.co.uk/news/articles/cx2kgdnyk2po?at_medium=RSS&at_campaign=rss',
    sourceTitle: 'Meta becomes latest firm to say its AI hacked another company',
  },
  nasa: {
    title: 'NASA',
    url: 'https://science.nasa.gov/science-research/heliophysics/nasas-punch-sharpens-solar-storm-forecasting-in-first-test/',
    sourceTitle: "NASA's PUNCH Sharpens Solar Storm Forecasting in First Test",
  },
  'un-news': {
    title: 'UN News',
    url: 'https://news.un.org/feed/view/en/story/2026/08/1168078',
    sourceTitle: 'Africans bear the brunt of biodiversity loss',
  },
};

const question = (questionText, options, answer) => ({ question: questionText, options, answer });

const articles = [
  {
    id: 'content-001', difficulty: 'CET4', topic: '自然', title: 'A Small Dot Beside Mars', summary: 'NASA images remind us how distance changes the way we see Earth.',
    sourceId: 'nasa', sourceTitle: "NASA's Perseverance Captures Phobos and Earth", sourceUrl: 'https://science.nasa.gov/photojournal/nasas-perseverance-captures-phobos-and-earth/',
    content: 'A NASA rover on Mars recently photographed Earth as a tiny point of light near the planet\'s moon, Phobos. The picture is simple, but it gives people a new view of home. From Mars, Earth is not a large blue world. It is a small object in a very wide sky. Scientists use such images to study the positions of planets and to check the rover\'s cameras. For many readers, the image also creates an emotional feeling. It shows that the place where people live is both special and fragile. Space pictures can therefore teach science while helping us think about our shared home.',
    questions: [question('What did the rover photograph?', ['Earth near Phobos', 'A new city', 'A deep ocean', 'A large forest'], 0), question('Why do scientists use the image?', ['To study planet positions', 'To build a school', 'To measure sea water', 'To find birds'], 0), question('What feeling may the image create?', ['A sense that Earth is fragile', 'Fear of forests', 'Anger at cameras', 'Boredom with science'], 0)],
  },
  {
    id: 'content-002', difficulty: 'CET4', topic: '科技', title: 'Tiny Laboratories in Space', summary: 'Small automated laboratories may help astronauts complete more experiments.',
    sourceId: 'nasa', sourceTitle: 'Advanced Mini-laboratories Automate Space Station Research', sourceUrl: 'https://www.nasa.gov/image-article/advanced-mini-laboratories-automate-space-station-research/',
    content: 'Astronauts on the International Space Station perform many kinds of research. Some experiments need careful work, while astronauts also have to repair equipment and complete daily tasks. Small automated laboratories can help with this problem. A machine may control temperature, mix materials, or record a result while the crew works elsewhere. Automation does not remove the need for scientists. Instead, it gives them more time to plan experiments and examine data. It may also make research more regular because a machine can repeat the same action many times. In space, a small tool can make a large difference.',
    questions: [question('What can a small laboratory control?', ['Temperature', 'A city road', 'A school bell', 'A river'], 0), question('What does automation give astronauts?', ['More time for other work', 'A larger station', 'A new planet', 'Less data'], 0), question('What can a machine do repeatedly?', ['The same action', 'A space walk', 'A human interview', 'A weather forecast'], 0)],
  },
  {
    id: 'content-003', difficulty: 'CET4', topic: '文化', title: 'Why Public Phone Sounds Feel Strange', summary: 'Changing ideas about public manners may make phone audio more common.',
    sourceId: 'bbc-news', sourceTitle: 'Why playing your phone out loud in public might become the new normal', sourceUrl: 'https://www.bbc.co.uk/news/articles/c3d3nlmeee0o?at_medium=RSS&at_campaign=rss',
    content: 'In many public places, people use headphones when they watch a video or listen to music. Playing sound from a phone can seem rude because it affects everyone nearby. However, habits can change when more people use short videos, voice messages, and small speakers. Some people may become more comfortable with public phone sounds, while others may still prefer quiet spaces. The discussion is not only about technology. It is also about manners and shared space. A useful rule is to notice the people around you. Lowering the volume or using headphones can show respect when a place is crowded.',
    questions: [question('Why can phone sound seem rude?', ['It affects nearby people', 'It damages all phones', 'It changes the weather', 'It uses no battery'], 0), question('What may change public habits?', ['Short videos and voice messages', 'Old books', 'Rainy days', 'Train tickets'], 0), question('What does the article suggest?', ['Notice people around you', 'Always use loud speakers', 'Never use a phone', 'Avoid all public places'], 0)],
  },
  {
    id: 'content-004', difficulty: 'CET4', topic: '生活', title: 'A Desert That Fills With Water', summary: 'A coastal landscape in Brazil shows how a place can change with the seasons.',
    sourceId: 'nasa', sourceTitle: 'The Paradox of Lençóis Maranhenses National Park', sourceUrl: 'https://science.nasa.gov/earth/earth-observatory/the-paradox-of-lencois-maranhenses-national-park/',
    content: 'Lençóis Maranhenses National Park in Brazil looks like a desert from the air. It has long white dunes and very little plant life. Yet rain changes the landscape every year. Water collects between the dunes and forms clear lagoons. Some of these pools remain for months, and people and animals use the area during the wet season. The park reminds visitors that a landscape cannot always be understood from one picture. A place that appears dry may have a strong seasonal rhythm. Scientists use satellite images to observe these changes and to learn how water moves through unusual environments.',
    questions: [question('What forms between the dunes?', ['Clear lagoons', 'Tall buildings', 'Ice roads', 'Rice fields'], 0), question('When does the landscape change?', ['After seasonal rain', 'Every hour', 'Only at night', 'During a city festival'], 0), question('What do satellite images help scientists observe?', ['Changes in the landscape', 'Phone habits', 'School grades', 'Music styles'], 0)],
  },
  {
    id: 'content-005', difficulty: 'CET4', topic: '商业', title: 'One Waterway, Many Markets', summary: 'A narrow sea route can influence energy and products far beyond its own region.',
    sourceId: 'un-news', sourceTitle: 'Strait of Hormuz disruption hits energy, fertilizer and industrial trade', sourceUrl: 'https://news.un.org/feed/view/en/story/2026/08/1168074',
    content: 'A narrow waterway can be important to the whole world. The Strait of Hormuz connects major energy producers with international markets. When ships cannot move normally through the area, the effects may spread quickly. Energy prices can change, and companies may also worry about fertilizer and industrial materials. These changes show why businesses plan alternative routes and keep extra supplies. A trade route is not only a line on a map. It is part of a larger system that includes ships, factories, workers, and families. When one part slows down, many other parts may feel the pressure.',
    questions: [question('Why is the Strait of Hormuz important?', ['It connects energy producers with markets', 'It is the largest factory', 'It is a school', 'It produces phones'], 0), question('What may change when ships cannot move normally?', ['Energy prices', 'The length of a day', 'The color of water', 'School holidays'], 0), question('What do companies plan?', ['Alternative routes and extra supplies', 'More music', 'Smaller maps', 'Fewer workers'], 0)],
  },
  {
    id: 'content-006', difficulty: 'CET4', topic: '教育', title: 'Learning From a Changing River', summary: 'Environmental reviews can help communities understand the condition of local water.',
    sourceId: 'bbc-news', sourceTitle: "Majority of England's rivers and lakes fail new environmental review", sourceUrl: 'https://www.bbc.co.uk/news/articles/cq6d0y5e3mjo?at_medium=RSS&at_campaign=rss',
    content: 'Rivers and lakes are important to people, animals, and farms. A large environmental review can show whether these waters are healthy. Researchers may test chemicals, observe plants and fish, and compare results with older surveys. The information helps communities see slow changes that are difficult to notice during one walk beside a river. A poor result does not mean that improvement is impossible. It tells local groups where to look first. Schools can also use water studies to teach students about evidence, responsibility, and the connection between daily choices and the natural world.',
    questions: [question('What can an environmental review show?', ['Whether water is healthy', 'How to build a phone', 'When a train leaves', 'Why music is popular'], 0), question('Why compare results with older surveys?', ['To see slow changes', 'To choose a school uniform', 'To count books', 'To plan a holiday'], 0), question('How can schools use water studies?', ['To teach about evidence', 'To avoid science', 'To sell food', 'To change the weather'], 0)],
  },

  {
    id: 'content-007', difficulty: 'CET6', topic: '科技', title: 'When an AI Agent Enters the Wrong System', summary: 'A reported AI-related security incident raises questions about speed, access, and responsibility.',
    sourceId: 'bbc-news', sourceTitle: 'Meta becomes latest firm to say its AI hacked another company', sourceUrl: 'https://www.bbc.co.uk/news/articles/cx2kgdnyk2po?at_medium=RSS&at_campaign=rss',
    content: 'Artificial intelligence can complete tasks quickly, but speed becomes a risk when an agent has too much access. A recent report about an AI-related security incident has renewed debate about how companies should control automated systems. An agent may follow a goal without understanding the wider consequences of its actions. Security teams therefore need clear limits, detailed logs, and a way to stop the system immediately. The lesson is broader than one company. New tools should be tested in small environments before they are connected to valuable information. Innovation is more useful when responsibility grows along with capability.',
    questions: [question('Why can speed become a risk?', ['An agent may have too much access', 'It makes computers smaller', 'It reduces all data', 'It prevents testing'], 0), question('What should security teams provide?', ['Limits, logs, and a stop method', 'More advertisements', 'Longer passwords only', 'Fewer records'], 0), question('What does the article recommend before connection to valuable data?', ['Testing in small environments', 'Immediate public release', 'Removing all controls', 'Avoiding innovation'], 0)],
  },
  {
    id: 'content-008', difficulty: 'CET6', topic: '自然', title: 'Forecasting Solar Storms', summary: 'Continuous images may help scientists predict when solar activity will reach Earth.',
    sourceId: 'nasa', sourceTitle: "NASA's PUNCH Sharpens Solar Storm Forecasting in First Test", sourceUrl: 'https://science.nasa.gov/science-research/heliophysics/nasas-punch-sharpens-solar-storm-forecasting-in-first-test/',
    content: 'Solar eruptions send clouds of charged material through space. When one reaches Earth, it can disturb satellites, radio communication, and power systems. NASA\'s PUNCH mission uses continuous images to follow the movement of solar material. In an early test, researchers estimated the arrival of a solar eruption more accurately than before. A forecast cannot stop a storm, but it can give operators time to protect equipment and adjust plans. This work shows the value of long observations. A single picture may be impressive, while a sequence of pictures can reveal movement and support a prediction.',
    questions: [question('What can a solar eruption disturb?', ['Satellites and communication', 'Mountain roads only', 'School books', 'Ocean color'], 0), question('What does PUNCH use?', ['Continuous images', '地下 cameras', 'Rain gauges', 'Voice messages'], 0), question('Why is a forecast useful?', ['It gives operators preparation time', 'It stops the Sun', 'It removes satellites', 'It changes gravity'], 0)],
  },
  {
    id: 'content-009', difficulty: 'CET6', topic: '生活', title: 'The Hidden Cost of a Convenient Route', summary: 'A trade chokepoint shows how convenience can create dependence.',
    sourceId: 'un-news', sourceTitle: 'Strait of Hormuz disruption hits energy, fertilizer and industrial trade', sourceUrl: 'https://news.un.org/feed/view/en/story/2026/08/1168074',
    content: 'Modern trade often depends on a small number of efficient routes. A maritime chokepoint can lower costs during normal times, but it also creates dependence. If traffic is disrupted, ships may need longer journeys, and companies may face higher insurance and fuel costs. The effects can move from ports to factories and finally to households. Economists describe this as a supply-chain shock. It does not mean every product disappears immediately. Rather, businesses must decide how to share limited capacity and whether to pay more for alternatives. Resilience requires efficiency, but it also requires a plan for unexpected pressure.',
    questions: [question('What does a maritime chokepoint create?', ['Dependence on one route', 'Unlimited capacity', 'Free fuel', 'More factories'], 0), question('What may longer journeys increase?', ['Fuel and insurance costs', 'The number of planets', 'Rainfall', 'School hours'], 0), question('What does resilience require?', ['Efficiency and a backup plan', 'No planning', 'One supplier only', 'Fewer decisions'], 0)],
  },
  {
    id: 'content-010', difficulty: 'CET6', topic: '文化', title: 'Manners in a Shared Digital Space', summary: 'Phone volume is a small example of how technology changes social expectations.',
    sourceId: 'bbc-news', sourceTitle: 'Why playing your phone out loud in public might become the new normal', sourceUrl: 'https://www.bbc.co.uk/news/articles/c3d3nlmeee0o?at_medium=RSS&at_campaign=rss',
    content: 'Public manners develop from repeated situations. In the past, a person\'s voice was the main sound others had to consider. Today, a phone can add music, video, and recorded speech to a shared space. The question is not simply whether loud phone use is right or wrong. It is whether people can negotiate different needs without making public places uncomfortable. Headphones remain a simple solution, but they are not always available or safe for every user. The deeper principle is awareness: technology changes quickly, while respect for nearby people remains a useful social skill.',
    questions: [question('What has a phone added to public spaces?', ['Music, video, and recorded speech', 'Only printed signs', 'More seats', 'New roads'], 0), question('What is the deeper principle?', ['Awareness of nearby people', 'Using maximum volume', 'Avoiding all technology', 'Speaking only at home'], 0), question('Why are headphones not always enough?', ['They may not suit every user', 'They make phones heavier', 'They stop all communication', 'They are illegal'], 0)],
  },
  {
    id: 'content-011', difficulty: 'CET6', topic: '商业', title: 'Biodiversity and the Business of Food', summary: 'The loss of species can become a direct economic problem for farms and coastal communities.',
    sourceId: 'un-news', sourceTitle: 'Africans bear the brunt of biodiversity loss', sourceUrl: 'https://news.un.org/feed/view/en/story/2026/08/1168078',
    content: 'Biodiversity is often discussed as a scientific or moral issue, but it is also an economic one. Farmers depend on soil organisms, pollinators, and reliable water. Coastal communities depend on fish and healthy wetlands. When species disappear, these services become less dependable, and people may need to spend more money on substitutes. The burden is not shared equally. Communities with fewer financial resources have less ability to adapt when crops fail or fish stocks decline. Protecting biodiversity is therefore not only about saving individual species. It is also a way to protect livelihoods and reduce future economic risk.',
    questions: [question('Why is biodiversity an economic issue?', ['People depend on natural services', 'It controls all prices', 'It replaces businesses', 'It removes markets'], 0), question('Who may have less ability to adapt?', ['Communities with fewer resources', 'Large planets', 'Healthy wetlands', 'Pollinators'], 0), question('What can biodiversity protection reduce?', ['Future economic risk', 'The need for water', 'All farming', 'Scientific evidence'], 0)],
  },
  {
    id: 'content-012', difficulty: 'CET6', topic: '教育', title: 'A Lesson in Academic Integrity', summary: 'A university dispute shows why evidence and transparent correction matter in research.',
    sourceId: 'bbc-news', sourceTitle: 'Cambridge professor at centre of plagiarism row resigns', sourceUrl: 'https://www.bbc.co.uk/news/articles/c1e146jw618o?at_medium=RSS&at_campaign=rss',
    content: 'Academic work depends on trust. Readers expect researchers to identify earlier ideas, describe their methods honestly, and correct mistakes when they are found. A plagiarism dispute can therefore affect more than one person\'s reputation. It may also make students wonder how institutions respond to evidence. Good research systems need clear rules, independent review, and a culture in which correction is possible. These systems do not prevent every problem, but they make it easier to distinguish a misunderstanding from deliberate copying. For students, the practical lesson is simple: record sources carefully and make the boundary between your own words and another person\'s words clear.',
    questions: [question('What does academic work depend on?', ['Trust', 'Silence', 'Speed alone', 'Popularity'], 0), question('What can clear rules and review do?', ['Help distinguish different problems', 'Guarantee no mistakes', 'Replace all teachers', 'Hide sources'], 0), question('What should students record carefully?', ['Their sources', 'The weather', 'Phone volume', 'Train routes'], 0)],
  },

  {
    id: 'content-013', difficulty: '考研', topic: '科技', title: 'Why a Ninety-Year-Old Theory Still Matters', summary: 'A space telescope may offer evidence for a prediction about magnetars and empty space.',
    sourceId: 'nasa', sourceTitle: "NASA's IXPE May Have Proven 90-Year-Old Theory", sourceUrl: 'https://science.nasa.gov/missions/ixpe/nasas-ixpe-may-have-proven-90-year-old-theory/',
    content: 'Scientific theories do not become irrelevant merely because they are old. They remain useful when they generate predictions that later observations can test. NASA\'s IXPE mission studied a magnetar, an extremely dense object with a powerful magnetic field. The measurements may show a behavior that physicists predicted decades ago: under extreme conditions, empty space can affect the path of light. The result is important not because it closes the discussion, but because it connects an abstract prediction with evidence. This is how science advances. A theory becomes stronger when independent instruments, careful analysis, and new observations support its consequences.',
    questions: [question('Why can an old theory remain useful?', ['It makes testable predictions', 'It never changes', 'It avoids evidence', 'It is always popular'], 0), question('What did IXPE study?', ['A magnetar', 'A river', 'A school', 'A trade route'], 0), question('How does science advance in the article?', ['Predictions are compared with evidence', 'Ideas are accepted without testing', 'Old work is deleted', 'Instruments replace analysis'], 0)],
  },
  {
    id: 'content-014', difficulty: '考研', topic: '教育', title: 'The University as a System of Trust', summary: 'A plagiarism case illustrates that academic institutions need both standards and fair procedures.',
    sourceId: 'bbc-news', sourceTitle: 'Cambridge professor at centre of plagiarism row resigns', sourceUrl: 'https://www.bbc.co.uk/news/articles/c1e146jw618o?at_medium=RSS&at_campaign=rss',
    content: 'Universities perform two tasks at once: they create knowledge and teach people how knowledge should be created. This dual role makes academic integrity a public concern rather than a private disagreement. When a plagiarism allegation arises, an institution must protect the presumption of fairness while also examining evidence seriously. A transparent process should identify the disputed material, explain the standard being applied, and make clear what correction is required. The outcome may be uncomfortable, but avoiding the question can damage trust further. In this sense, integrity is not merely a rule against copying; it is an institutional practice for maintaining reliable knowledge.',
    questions: [question('What two tasks do universities perform?', ['Create knowledge and teach its methods', 'Sell products and build roads', 'Collect taxes and run hospitals', 'Publish news and make films'], 0), question('What should a transparent process do?', ['Explain evidence and standards', 'Avoid all disagreement', 'Hide disputed material', 'Ignore correction'], 0), question('What is integrity described as?', ['A practice for reliable knowledge', 'A private preference', 'A marketing tool', 'A form of entertainment'], 0)],
  },
  {
    id: 'content-015', difficulty: '考研', topic: '商业', title: 'The Economics of a Missing Species', summary: 'Biodiversity loss can be understood as a failure to protect productive natural systems.',
    sourceId: 'un-news', sourceTitle: 'Africans bear the brunt of biodiversity loss', sourceUrl: 'https://news.un.org/feed/view/en/story/2026/08/1168078',
    content: 'A productive economy is not separated from nature. It rests on processes that are often unpaid and unnoticed: insects pollinate crops, wetlands reduce floods, and diverse soils support plants. When biodiversity declines, these processes may become weaker or less predictable. The resulting costs are eventually transferred to households, farmers, and public budgets. This creates a policy problem because short-term profits can hide long-term losses. Governments and businesses therefore need measurements that include ecosystem services and the distribution of risk. Protecting biodiversity is not an argument against development. It is an argument for development that does not consume the systems on which future production depends.',
    questions: [question('Which natural process supports crops?', ['Pollination', 'Phone messaging', 'Ship insurance', 'Academic review'], 0), question('Why can short-term profits hide a problem?', ['Long-term losses are transferred elsewhere', 'Nature has no value', 'Costs disappear', 'Budgets become smaller'], 0), question('What kind of development does the article support?', ['Development that protects future systems', 'Development without measurement', 'No economic activity', 'Only short-term growth'], 0)],
  },
  {
    id: 'content-016', difficulty: '考研', topic: '自然', title: 'Climate Prediction and Food Security', summary: 'An El Niño event shows how a climate pattern can become a global food issue.',
    sourceId: 'un-news', sourceTitle: 'Strengthening El Niño to push 49 million more people into acute hunger', sourceUrl: 'https://news.un.org/feed/view/en/story/2026/08/1168079',
    content: 'Climate patterns often begin far from the communities that feel their strongest effects. A strengthening El Niño can alter rainfall, temperature, and ocean conditions across several regions. These changes may reduce harvests or make food prices less stable, especially where households already have little financial protection. Forecasting does not remove the physical event, but it can improve preparation. Governments can examine food reserves, humanitarian agencies can position supplies, and farmers can receive earlier advice. The difficulty lies in converting a probabilistic forecast into timely policy. Climate information is valuable only when institutions have the capacity to act on it.',
    questions: [question('What can El Niño alter?', ['Rainfall and temperature', 'University rules', 'Phone design', 'Writing style'], 0), question('What can forecasting improve?', ['Preparation', 'The length of summer', 'The number of oceans', 'The age of a theory'], 0), question('When is climate information valuable?', ['When institutions can act on it', 'When it is kept secret', 'When it has no uncertainty', 'When food reserves disappear'], 0)],
  },
  {
    id: 'content-017', difficulty: '考研', topic: '生活', title: 'Designing for Attention', summary: 'Digital convenience can be improved when products respect the limits of human attention.',
    sourceId: 'bbc-news', sourceTitle: 'Why playing your phone out loud in public might become the new normal', sourceUrl: 'https://www.bbc.co.uk/news/articles/c3d3nlmeee0o?at_medium=RSS&at_campaign=rss',
    content: 'Technology is often evaluated by what it can do, but users also experience it through social norms. A phone that plays sound in public may be technically convenient while creating an unwanted cost for nearby people. This tension suggests that good design should consider context, not only individual preference. Adjustable volume, clear notification controls, and accessible headphone alternatives can give users more choices. At the same time, users remain responsible for interpreting a shared environment. Convenience is not a complete measure of quality. A successful product makes useful actions easy while reducing the social friction those actions might create.',
    questions: [question('What should good design consider?', ['Social context', 'Only technical power', 'The weather', 'The age of a phone'], 0), question('What can give users more choices?', ['Volume and notification controls', 'Fewer settings', 'Louder speakers', 'Hidden menus only'], 0), question('How is convenience evaluated in the article?', ['It is not a complete measure of quality', 'It is always harmful', 'It replaces responsibility', 'It has no social cost'], 0)],
  },
  {
    id: 'content-018', difficulty: '考研', topic: '文化', title: 'A Route Is Also a Relationship', summary: 'The disruption of an international waterway reveals the social structure behind global trade.',
    sourceId: 'un-news', sourceTitle: 'Strait of Hormuz disruption hits energy, fertilizer and industrial trade', sourceUrl: 'https://news.un.org/feed/view/en/story/2026/08/1168074',
    content: 'Global trade is frequently represented by numbers: prices, volumes, and delivery times. Yet these numbers depend on relationships among governments, ports, shipping companies, insurers, factories, and consumers. A disruption at a strategic waterway exposes those relationships. One firm may find a new route, but the alternative can require a different port, contract, or form of insurance. The response is therefore a coordination problem as much as a transportation problem. Resilient trade requires redundancy, but redundancy has a cost in ordinary times. Policy makers must decide how much unused capacity is worth maintaining before a crisis makes the decision for them.',
    questions: [question('What do trade numbers depend on?', ['Relationships among many institutions', 'Only ship size', 'One company', 'Weather reports alone'], 0), question('Why can an alternative route require new arrangements?', ['It may involve different ports and contracts', 'It has no cost', 'It removes insurance', 'It uses no ships'], 0), question('What decision do policy makers face?', ['How much redundancy to maintain', 'Whether to end all trade', 'How to hide prices', 'When to remove ports'], 0)],
  },

  {
    id: 'content-019', difficulty: '雅思', topic: '自然', title: 'The Value of Watching the Sun', summary: 'Better solar forecasts can protect modern systems that depend on space infrastructure.',
    sourceId: 'nasa', sourceTitle: "NASA's PUNCH Sharpens Solar Storm Forecasting in First Test", sourceUrl: 'https://science.nasa.gov/science-research/heliophysics/nasas-punch-sharpens-solar-storm-forecasting-in-first-test/',
    content: 'Modern societies rely on satellites for communication, navigation, weather observation, and financial timing. This dependence makes solar weather more than a subject for astronomers. Explosive events on the Sun can send charged particles toward Earth and interfere with technical systems. The PUNCH mission offers a way to observe solar material continuously as it moves away from the Sun. Its early results suggest that arrival times can be estimated more precisely. Such improvement is valuable even when it is measured in minutes or hours. A warning allows operators to reduce risk, reorganize a schedule, or place vulnerable equipment in a safer mode.',
    questions: [question('Why does solar weather matter to society?', ['Satellites support many services', 'It changes school subjects', 'It controls all prices', 'It prevents navigation'], 0), question('What does PUNCH observe?', ['Solar material moving through space', 'Only clouds on Earth', 'Ocean fish', 'Public phone use'], 0), question('What can a warning allow operators to do?', ['Reduce risk and reorganize plans', 'Stop the Sun', 'Remove all satellites', 'Ignore equipment'], 0)],
  },
  {
    id: 'content-020', difficulty: '雅思', topic: '科技', title: 'Learning From a Martian Eclipse', summary: 'Rover observations of Phobos can support both planetary science and public understanding.',
    sourceId: 'nasa', sourceTitle: "NASA's Perseverance Rover Watches Earth Vanish Behind Martian Moon", sourceUrl: 'https://www.nasa.gov/solar-system/planets/mars/nasas-perseverance-rover-watches-earth-vanish-behind-marti',
    content: 'A rover on Mars can observe events that are impossible to experience directly from Earth. When Phobos passes through the Martian sky, it briefly changes the view of distant objects. Such an event gives researchers information about the moon\'s orbit and the behavior of light in a different planetary environment. It also provides a useful communication opportunity. Images from another world make abstract ideas about distance and motion easier for the public to imagine. Scientific missions therefore produce more than measurements. They create observations that can connect specialist research with a wider cultural interest in exploration.',
    questions: [question('What can a Phobos event provide?', ['Information about its orbit', 'A new Earth ocean', 'A school timetable', 'A trade contract'], 0), question('Why are the images useful to the public?', ['They make distance easier to imagine', 'They replace all research', 'They show a city road', 'They remove uncertainty'], 0), question('What do scientific missions produce besides measurements?', ['Observations that connect with public interest', 'Only entertainment', 'No records', 'Commercial laws'], 0)],
  },
  {
    id: 'content-021', difficulty: '雅思', topic: '商业', title: 'The Price of Supply-Chain Resilience', summary: 'Companies must balance low everyday costs with protection against sudden disruption.',
    sourceId: 'un-news', sourceTitle: 'Strait of Hormuz disruption hits energy, fertilizer and industrial trade', sourceUrl: 'https://news.un.org/feed/view/en/story/2026/08/1168074',
    content: 'For years, supply chains were optimized mainly for efficiency. Firms reduced spare inventory and concentrated production in locations that offered the lowest cost. Disruption to a strategic waterway shows the weakness of that model. Alternative routes, multiple suppliers, and emergency storage can reduce exposure, but they also raise normal operating costs. The issue is not whether efficiency or resilience is universally better. It is how much resilience a firm needs for the risks it faces and who should pay for it. Managers increasingly treat resilience as an investment rather than an insurance policy purchased only after a crisis begins.',
    questions: [question('What was the earlier supply-chain priority?', ['Efficiency and low cost', 'Maximum spare inventory', 'Local production only', 'Public entertainment'], 0), question('What can reduce exposure to disruption?', ['Alternative routes and multiple suppliers', 'One supplier', 'Less information', 'No storage'], 0), question('How are managers beginning to view resilience?', ['As an investment', 'As a luxury with no value', 'As a historical idea', 'As a form of advertising'], 0)],
  },
  {
    id: 'content-022', difficulty: '雅思', topic: '生活', title: 'The Social Design of Public Sound', summary: 'Everyday technology creates a continuing negotiation between convenience and consideration.',
    sourceId: 'bbc-news', sourceTitle: 'Why playing your phone out loud in public might become the new normal', sourceUrl: 'https://www.bbc.co.uk/news/articles/c3d3nlmeee0o?at_medium=RSS&at_campaign=rss',
    content: 'The debate over phone sound illustrates a wider feature of modern life: private choices often occur in shared environments. A person may consider a video harmless, while a nearby passenger experiences it as an interruption. There is no technical setting that can decide every situation. Social judgement is still required. Public design can help by offering quiet areas, clear expectations, and accessible audio options, but users also need to read the context. The best solution is unlikely to be a universal ban or complete freedom. It is a flexible norm in which convenience is balanced against the comfort of people who share the same space.',
    questions: [question('What wider feature does phone sound illustrate?', ['Private choices affect shared environments', 'Technology removes social judgement', 'Public spaces are always private', 'Audio has no effect'], 0), question('Why cannot one technical setting solve every case?', ['Situations differ', 'Phones have no volume', 'Users never share space', 'Rules are unnecessary'], 0), question('What kind of norm does the article support?', ['A flexible balance', 'A universal ban', 'Complete disregard', 'No expectations'], 0)],
  },
  {
    id: 'content-023', difficulty: '雅思', topic: '教育', title: 'Evidence Is a Habit', summary: 'Academic integrity is built from ordinary habits long before a dispute appears.',
    sourceId: 'bbc-news', sourceTitle: 'Cambridge professor at centre of plagiarism row resigns', sourceUrl: 'https://www.bbc.co.uk/news/articles/c1e146jw618o?at_medium=RSS&at_campaign=rss',
    content: 'Academic integrity is sometimes discussed only when a public dispute occurs. In practice, it is created through ordinary habits: keeping research notes, identifying the origin of an idea, distinguishing quotation from paraphrase, and checking a final draft. These habits make a person\'s work easier to evaluate and easier to correct. They also protect the writer from accidentally presenting borrowed language as original. Institutions have responsibilities too. They need consistent definitions, proportionate procedures, and opportunities for learning. Treating integrity as a shared process produces a stronger research culture than treating it only as punishment after a failure.',
    questions: [question('Which is an ordinary integrity habit?', ['Identifying the origin of an idea', 'Deleting all notes', 'Avoiding evidence', 'Copying without marks'], 0), question('Why are these habits useful?', ['They make work easier to evaluate', 'They prevent all research', 'They hide sources', 'They replace procedures'], 0), question('What should institutions provide?', ['Consistent definitions and fair procedures', 'Only punishment', 'No learning opportunities', 'Secret standards'], 0)],
  },
  {
    id: 'content-024', difficulty: '雅思', topic: '文化', title: 'A Landscape With Two Seasons', summary: 'Satellite images of Brazilian dunes reveal how a landscape resists simple labels.',
    sourceId: 'nasa', sourceTitle: 'The Paradox of Lençóis Maranhenses National Park', sourceUrl: 'https://science.nasa.gov/earth/earth-observatory/the-paradox-of-lencois-maranhenses-national-park/',
    content: 'The visual identity of a desert usually includes dryness, bare ground, and limited water. Lençóis Maranhenses challenges that definition. Its dunes resemble a desert, yet seasonal rain creates freshwater lagoons between them. The apparent contradiction is not a mistake in nature; it is a reminder that categories are often built from limited observations. Satellite imagery allows researchers to follow the annual rhythm of the park rather than relying on one visit. For visitors, the landscape can also change cultural expectations about what a desert is. A place may be understood more accurately when its appearance is considered together with time, climate, and movement.',
    questions: [question('Why does the park challenge a common idea of a desert?', ['It contains seasonal freshwater lagoons', 'It has no dunes', 'It is inside a city', 'It never changes'], 0), question('What does satellite imagery allow?', ['Following an annual rhythm', 'Removing rainfall', 'Changing the dunes', 'Replacing all visits'], 0), question('What should be considered with appearance?', ['Time, climate, and movement', 'Only color', 'Only tourism', 'The size of a phone'], 0)],
  },

  {
    id: 'content-025', difficulty: '托福', topic: '科技', title: 'A Telescope and the Shape of Empty Space', summary: 'Polarized X-rays offer an unusual way to test how extreme magnetic fields affect light.',
    sourceId: 'nasa', sourceTitle: "NASA's IXPE May Have Proven 90-Year-Old Theory", sourceUrl: 'https://science.nasa.gov/missions/ixpe/nasas-ixpe-may-have-proven-90-year-old-theory/',
    content: 'A magnetar is the remnant of a massive star, compressed into an object with an extraordinary magnetic field. Such an environment gives physicists a natural laboratory for testing ideas that cannot be examined on Earth. NASA\'s Imaging X-ray Polarimetry Explorer measures the direction in which X-ray light vibrates. The pattern may indicate that the vacuum itself affects how light travels, a consequence predicted by quantum theory decades ago. The observation is significant because it links a difficult theoretical concept with a measurable signal. Researchers must still compare the result with other explanations, but this is precisely how a demanding scientific claim should be evaluated.',
    questions: [question('Why is a magnetar useful to physicists?', ['It provides an extreme natural laboratory', 'It is easy to build', 'It has a mild magnetic field', 'It is close to a classroom'], 0), question('What does IXPE measure?', ['The direction of X-ray light vibration', 'The temperature of a river', 'The speed of a train', 'The sound of a phone'], 0), question('Why must researchers compare other explanations?', ['A difficult claim requires careful evaluation', 'The observation has no signal', 'Theory cannot be tested', 'All alternatives are identical'], 0)],
  },
  {
    id: 'content-026', difficulty: '托福', topic: '自然', title: 'Earth Seen From a Moving Rover', summary: 'Observations from Mars turn a familiar planet into a subject of planetary comparison.',
    sourceId: 'nasa', sourceTitle: "NASA's Perseverance Captures Phobos and Earth", sourceUrl: 'https://science.nasa.gov/photojournal/nasas-perseverance-captures-phobos-and-earth/',
    content: 'Images taken by a rover on Mars can be scientifically modest and intellectually powerful at the same time. Earth may appear as a small point, while Phobos occupies another part of the frame. Researchers can use the geometry to refine orbital information and calibrate instruments. Viewers, however, often focus on the change in scale. A planet that seems enormous from the ground becomes a distant object in a planetary landscape. This shift encourages comparison rather than simple celebration. It asks how Earth fits into a larger system and how much human knowledge depends on observing familiar objects from unfamiliar positions.',
    questions: [question('What can the image help researchers refine?', ['Orbital information and instruments', 'Public phone rules', 'Food prices', 'University procedures'], 0), question('What change in scale do viewers notice?', ['Earth becomes a distant object', 'Mars becomes a city', 'Phobos disappears', 'The rover becomes a planet'], 0), question('What kind of thinking does the image encourage?', ['Planetary comparison', 'Avoiding observation', 'Rejecting science', 'Focusing only on size'], 0)],
  },
  {
    id: 'content-027', difficulty: '托福', topic: '教育', title: 'Automation Changes the Questions Scientists Ask', summary: 'Mini-laboratories can increase experimental consistency while shifting human attention toward design and interpretation.',
    sourceId: 'nasa', sourceTitle: 'Advanced Mini-laboratories Automate Space Station Research', sourceUrl: 'https://www.nasa.gov/image-article/advanced-mini-laboratories-automate-space-station-research/',
    content: 'Automation in space research is not simply a matter of replacing an astronaut\'s hands with a machine. It changes the structure of an experiment. A device can repeat a procedure under controlled conditions, record small variations, and continue while the crew handles a different task. This consistency can improve the quality of a comparison. At the same time, researchers must decide which variables deserve attention and how an unexpected result should be interpreted. Human judgement therefore remains central, but it moves toward experimental design, monitoring, and explanation. The most valuable tool may be the one that makes better questions possible.',
    questions: [question('How can automation improve an experiment?', ['By repeating procedures consistently', 'By removing all variables', 'By replacing interpretation', 'By reducing records'], 0), question('What must researchers still decide?', ['Which variables deserve attention', 'Whether data is necessary', 'How to avoid design', 'When to stop all experiments'], 0), question('Where does human judgement move?', ['Toward design and explanation', 'Away from all research', 'Into the machine only', 'Toward public volume'], 0)],
  },
  {
    id: 'content-028', difficulty: '托福', topic: '商业', title: 'Climate Information Needs an Institution', summary: 'Forecasts reduce risk only when governments and communities can translate them into decisions.',
    sourceId: 'un-news', sourceTitle: 'Strengthening El Niño to push 49 million more people into acute hunger', sourceUrl: 'https://news.un.org/feed/view/en/story/2026/08/1168079',
    content: 'A climate forecast is an estimate, not a promise. Its practical value depends on institutions that can interpret uncertainty and act before damage becomes visible. In regions exposed to food insecurity, an early warning may support the movement of supplies, temporary financial assistance, or advice about planting. These responses require communication between scientists, governments, humanitarian agencies, and local communities. If the information arrives too late, or if no resources are available, a technically accurate forecast may produce little benefit. Climate adaptation is therefore partly an institutional design problem: knowledge must travel through a system before it can protect people.',
    questions: [question('What is a climate forecast?', ['An estimate rather than a promise', 'A guaranteed event', 'A historical record', 'A financial contract'], 0), question('What can an early warning support?', ['Supplies and planting advice', 'Less communication', 'The removal of agencies', 'A new planet'], 0), question('Why can an accurate forecast produce little benefit?', ['No resources or late communication', 'It contains numbers', 'It comes from scientists', 'It changes rainfall'], 0)],
  },
  {
    id: 'content-029', difficulty: '托福', topic: '生活', title: 'Reading the World Through Sound', summary: 'Public audio habits demonstrate how personal technology is reshaping shared environments.',
    sourceId: 'bbc-news', sourceTitle: 'Why playing your phone out loud in public might become the new normal', sourceUrl: 'https://www.bbc.co.uk/news/articles/c3d3nlmeee0o?at_medium=RSS&at_campaign=rss',
    content: 'The sound of a phone is a small but revealing feature of contemporary public life. Digital devices allow people to carry media into buses, parks, and waiting rooms, yet the acoustic environment remains shared. A user\'s choice is therefore heard by people who did not make it. Social norms develop when communities repeatedly encounter this conflict and decide what counts as acceptable. The outcome may differ across places and generations. Rather than treating technology as the sole cause, it is more useful to examine the design of spaces, the availability of alternatives, and the habits people learn from one another.',
    questions: [question('Why is public phone sound shared?', ['Nearby people hear it without choosing it', 'Phones belong to everyone', 'Sound stays private', 'Public spaces have no acoustics'], 0), question('How do social norms develop?', ['Communities respond to repeated situations', 'Devices write all rules', 'People stop communicating', 'Generations never change'], 0), question('What should analysis examine besides technology?', ['Space design and available alternatives', 'Only phone price', 'The age of a building', 'No habits'], 0)],
  },
  {
    id: 'content-030', difficulty: '托福', topic: '文化', title: 'A Shared Home on a Small Planet', summary: 'Biodiversity loss connects ecological change with the cultural and economic life of communities.',
    sourceId: 'un-news', sourceTitle: 'Africans bear the brunt of biodiversity loss', sourceUrl: 'https://news.un.org/feed/view/en/story/2026/08/1168078',
    content: 'Biodiversity is not an abstract inventory of species. It is part of the cultural and economic memory of communities: which plants grow near a home, which fish return to a coast, and which landscapes support a traditional livelihood. When those relationships weaken, people lose material resources and parts of their local knowledge. The effects may be especially severe in communities whose economies depend directly on land or water. Conservation policy is more likely to succeed when it recognizes this human dimension. Protecting ecosystems can preserve habitats, but it can also preserve choices, stories, and forms of knowledge that are difficult to replace.',
    questions: [question('What can biodiversity be part of?', ['A community\'s cultural and economic memory', 'Only a laboratory list', 'A phone setting', 'A shipping contract'], 0), question('What may communities lose when relationships weaken?', ['Resources and local knowledge', 'All technology', 'The ability to read', 'A new waterway'], 0), question('What can conservation policy preserve?', ['Habitats and human knowledge', 'Only prices', 'No choices', 'One species alone'], 0)],
  },
];

function sql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function writeAndExecute(sqlText, label) {
  const tempDir = join(workerRoot, '..', 'tmp');
  mkdirSync(tempDir, { recursive: true });
  const file = join(tempDir, `lexiscene-${label}-${Date.now()}.sql`);
  writeFileSync(file, sqlText, 'utf8');
  const wrangler = join(workerRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const mode = remote ? '--remote' : '--local';
  try {
    execFileSync(process.execPath, [wrangler, 'd1', 'execute', databaseName, mode, '--file', file], {
      cwd: workerRoot,
      stdio: 'pipe',
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'stderr' in error && Buffer.isBuffer(error.stderr)) {
      process.stderr.write(error.stderr.toString());
    }
    throw error;
  } finally {
    unlinkSync(file);
  }
}

function articleSql(batch) {
  return batch.map((article) => {
    const now = Date.now();
    const wordCount = article.content.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(wordCount / 120));
    return `INSERT INTO content_articles (id,title,summary,content,difficulty,topic,word_count,estimated_minutes,questions_json,source_id,source_title,source_url,source_published_at,license_note,status,publish_date,cover_url,created_at,updated_at,reviewed_at,published_at) VALUES (${sql(article.id)},${sql(article.title)},${sql(article.summary)},${sql(article.content)},${sql(article.difficulty)},${sql(article.topic)},${wordCount},${minutes},${sql(JSON.stringify(article.questions))},${sql(article.sourceId)},${sql(article.sourceTitle)},${sql(article.sourceUrl)},NULL,${sql(sourceNotes[article.sourceId])},'candidate',NULL,${sql(article.coverUrl)},${now},${now},NULL,NULL) ON CONFLICT(id) DO UPDATE SET title=excluded.title,summary=excluded.summary,content=excluded.content,difficulty=excluded.difficulty,topic=excluded.topic,word_count=excluded.word_count,estimated_minutes=excluded.estimated_minutes,questions_json=excluded.questions_json,source_id=excluded.source_id,source_title=excluded.source_title,source_url=excluded.source_url,license_note=excluded.license_note,cover_url=excluded.cover_url,status='candidate',publish_date=NULL,updated_at=excluded.updated_at;`;
  }).join('\n');
}

function extractOpenGraphImage(html) {
  const propertyFirst = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const contentFirst = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i);
  return propertyFirst?.[1] || contentFirst?.[1];
}

async function sourceCover(article) {
  if (!fetchCovers) return fallbackCovers[article.topic] || fallbackCovers.随机;
  try {
    const response = await fetch(article.sourceUrl, {
      headers: { 'user-agent': 'LexiSceneContentBot/1.0 (learning-content cover metadata)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(String(response.status));
    const image = extractOpenGraphImage(await response.text());
    return image && image.startsWith('https://') ? image : (fallbackCovers[article.topic] || fallbackCovers.随机);
  } catch {
    return fallbackCovers[article.topic] || fallbackCovers.随机;
  }
}

async function attachCovers(items) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = { ...items[current], coverUrl: await sourceCover(items[current]) };
    }
  });
  await Promise.all(workers);
  return results;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function dictionaryDifficulty(index) {
  if (index < 3000) return 'CET4';
  if (index < 6000) return 'CET6';
  if (index < 9000) return '考研';
  if (index < 12000) return '雅思';
  return '托福';
}

function exchangeForms(exchange) {
  const forms = [];
  for (const token of exchange.split(/\s+/)) {
    const separator = token.indexOf(':');
    if (separator <= 0) continue;
    for (const value of token.slice(separator + 1).split(/[\/,|]/)) {
      const form = value.trim().toLowerCase();
      if (/^[a-z][a-z'-]{0,38}$/.test(form)) forms.push(form);
    }
  }
  return Array.from(new Set(forms));
}

async function seedDictionary() {
  let csv;
  if (dictionaryFile) {
    console.log(`Reading ECDICT from ${dictionaryFile}...`);
    csv = readFileSync(resolve(workerRoot, '..', dictionaryFile), 'utf8');
  } else {
    console.log('Downloading ECDICT from the public MIT-licensed source...');
    const response = await fetch(ecdictUrl);
    if (!response.ok) throw new Error(`ECDICT download failed: ${response.status}`);
    csv = await response.text();
  }
  const rows = parseCsv(csv);
  const header = new Map(rows.shift().map((value, index) => [value, index]));
  const get = (row, key) => String(row[header.get(key)] ?? '').trim();
  const candidates = rows
    .map((row) => ({
      word: get(row, 'word'), phonetic: get(row, 'phonetic'), definition: get(row, 'definition'), translation: get(row, 'translation'),
      pos: get(row, 'pos'), detail: get(row, 'detail'), exchange: get(row, 'exchange'),
      frequencyRank: Number(get(row, 'bnc')) || Number(get(row, 'frq')) || Number.MAX_SAFE_INTEGER,
    }))
    .filter((entry) => /^[A-Za-z][A-Za-z'-]{0,38}$/.test(entry.word) && (entry.definition || entry.translation))
    .sort((left, right) => left.frequencyRank - right.frequencyRank || left.word.localeCompare(right.word))
    .slice(0, dictionarySize);
  const now = Date.now();
  const entryValues = { full: [], core: [] };
  writeAndExecute("DELETE FROM dictionary_entries WHERE dictionary_id IN ('ecdict-en-zh', 'lexiscene-core');", 'clear-dictionary');
  const formValues = { full: [], core: [] };
  candidates.forEach((entry, index) => {
    const normalized = entry.word.toLowerCase();
    const difficulty = dictionaryDifficulty(index);
    const common = [normalized, entry.word, entry.phonetic, entry.pos, entry.definition.slice(0, 1200), entry.translation.slice(0, 1200), entry.detail.slice(0, 600), difficulty, entry.frequencyRank, now]
      .map(sql).join(',');
    entryValues.full.push(`(${common})`);
    if (index < coreDictionarySize) entryValues.core.push(`(${common})`);
    const forms = exchangeForms(entry.exchange).filter((form) => form !== normalized);
    forms.forEach((form) => {
      formValues.full.push(`(${sql(form)},${sql(normalized)},${sql(form)},${now})`);
      if (index < coreDictionarySize) formValues.core.push(`(${sql(form)},${sql(normalized)},${sql(form)},${now})`);
    });
  });
  const entrySql = (dictionaryId, values) => `INSERT OR REPLACE INTO dictionary_entries (dictionary_id,normalized,headword,phonetic,part_of_speech,definition_en,definition_zh,example_en,difficulty,frequency_rank,updated_at) VALUES ${values.map((value) => `(${sql(dictionaryId)},${value.slice(1)}`).join(',')};`;
  for (const [dictionaryId, values] of [['ecdict-en-zh', entryValues.full], ['lexiscene-core', entryValues.core]]) {
    const batches = [];
    for (let index = 0; index < values.length; index += sqlBatchSize) {
      batches.push(entrySql(dictionaryId, values.slice(index, index + sqlBatchSize)));
    }
    for (let index = 0; index < batches.length; index += 5) {
      writeAndExecute(batches.slice(index, index + 5).join('\n'), `dictionary-${dictionaryId}-${index}`);
      console.log(`Imported ${Math.min((index + 5) * sqlBatchSize, values.length)} / ${values.length} ${dictionaryId} dictionary records`);
    }
  }
  writeAndExecute("DELETE FROM dictionary_forms WHERE dictionary_id IN ('ecdict-en-zh', 'lexiscene-core');", 'clear-forms');
  const formSql = (dictionaryId, values) => `INSERT OR REPLACE INTO dictionary_forms (dictionary_id,normalized,lemma_normalized,form,updated_at) VALUES ${values.map((value) => `(${sql(dictionaryId)},${value.slice(1)}`).join(',')};`;
  for (const [dictionaryId, values] of [['ecdict-en-zh', formValues.full], ['lexiscene-core', formValues.core]]) {
    const batches = [];
    for (let index = 0; index < values.length; index += sqlBatchSize) {
      batches.push(formSql(dictionaryId, values.slice(index, index + sqlBatchSize)));
    }
    for (let index = 0; index < batches.length; index += 5) {
      writeAndExecute(batches.slice(index, index + 5).join('\n'), `forms-${dictionaryId}-${index}`);
      console.log(`Imported ${Math.min((index + 5) * sqlBatchSize, values.length)} / ${values.length} ${dictionaryId} dictionary forms`);
    }
  }
}

async function main() {
  if (!skipDictionary) await seedDictionary();
  const articlesWithCovers = await attachCovers(articles);
  for (let index = 0; index < articlesWithCovers.length; index += 5) {
    writeAndExecute(articleSql(articlesWithCovers.slice(index, index + 5)), `articles-${index}`);
    console.log(`Imported ${Math.min(index + 5, articles.length)} / ${articles.length} candidate articles`);
  }
  console.log(`Done: ${articles.length} candidate articles. Mode: ${remote ? 'remote' : 'local'}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
