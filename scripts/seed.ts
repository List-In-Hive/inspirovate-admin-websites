import { readArticles } from "../lib/store";
import { saveArticle } from "../lib/service";

async function seed() {
  if ((await readArticles()).length) { console.log("Drafts already exist; nothing was changed."); return; }
  const draft = await saveArticle({
    title: "Flowers for a relaxed dinner table",
    slug: "flowers-for-a-relaxed-dinner-table",
    description: "A few thoughtful ways to choose and arrange flowers for a table made for conversation.",
    publishedAt: new Date().toISOString(),
    coverImage: "/images/arrangement-2.webp",
    coverAlt: "Ivory and white flowers arranged in a vase",
    body: `A dinner table does not need a grand centrepiece to feel welcoming. A small gathering of flowers can be enough to make an ordinary evening feel considered.

## Leave room for conversation

Before choosing a vase, think about how people will sit. Try an arrangement that lets guests see each other comfortably, and leave space for serving dishes, glasses and the meal itself.

## Start with a simple palette

Take a cue from the things you already have: a linen napkin, a favourite plate or the colour of the room. Soft whites can sit quietly alongside a patterned tablecloth, while a small touch of colour can bring a plain setting to life.

## Work with the shape of the table

A single vase can make a lovely focal point on a small round table. For a longer table, try a few smaller vessels with space between them. Set them out before adding flowers so you can adjust the arrangement around the rest of the table.

## Make it personal

Choose flowers you enjoy looking at, and let the setting feel like your home. Browse [our flower collection](/flowers) for inspiration, or [tell us about your gathering](/contact?type=event) so we can discuss an arrangement with you.`,
  });
  console.log(`Draft created: ${draft.title}. It has not been approved or published.`);
}
seed().catch(error => { console.error(error.message); process.exitCode = 1; });
