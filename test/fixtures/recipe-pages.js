// Ten recipe pages for the recipe import tests. These are written to match the shape each kind of site uses for its
// schema.org block (WordPress recipe plugins with a Yoast @graph, Allrecipes/Dotdash arrays with two @types,
// NYT-style plain blocks, HowToSection-free ingredient lists, HTML entities, yields as arrays), plus one page with
// no block at all. They were not downloaded, so swap in saved real pages here when there are some.
const ld = o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const page = (title, ...blocks) => `<!doctype html><html><head><title>${title}</title>${blocks.join('')}</head><body><div class="ad">Ad</div></body></html>`;

module.exports = [
  { site: 'food blog (WP Recipe Maker, Yoast @graph)', url: 'https://blog.example/one-pot-chili-pasta/',
    html: page('One Pot Chili Pasta', ld({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebPage', name: 'One Pot Chili Pasta' },
      { '@type': 'Recipe', name: 'One Pot Chili Pasta', recipeYield: ['6', '6 servings'], prepTime: 'PT10M', cookTime: 'PT25M', totalTime: 'PT35M',
        recipeCategory: ['Dinner'], recipeCuisine: ['American'], keywords: 'one pot pasta, chili',
        image: ['https://blog.example/chili.jpg'],
        recipeIngredient: ['1 Tbsp olive oil', '1 yellow onion', '2 cloves garlic', '1 lb. ground beef', '2 Tbsp chili powder', '1 tsp ground cumin',
          '1 (15 oz.) can black beans', '1 (15 oz.) can diced tomatoes', '2 cups beef broth', '8 oz. pasta', '1 cup shredded cheddar (about 4 oz)',
          '2 green onions, sliced', 'salt and pepper to taste'] }] })),
    expect: { name: 'One Pot Chili Pasta', serv: 6, total: 35, meal: 'dinner', basics: 1,
      lines: { '1 (15 oz.) can black beans': ['black_beans', 1], '1 lb. ground beef': ['ground_beef', 1], '1 cup shredded cheddar (about 4 oz)': ['cheddar', 4], '2 Tbsp chili powder': ['chili_powder', 6] } } },

  { site: 'Allrecipes-style (array, @type list)', url: 'https://recipes.example/recipe/123/baked-ziti/',
    html: page('Baked Ziti Recipe', ld([{ '@context': 'http://schema.org', '@type': ['Recipe', 'NewsArticle'], name: 'Baked Ziti', recipeYield: '8',
      totalTime: 'PT1H', prepTime: 'PT15M', recipeCategory: ['Dinner', 'Main Dishes'], keywords: 'baked pasta casserole',
      recipeIngredient: ['1 pound dry ziti pasta', '1 onion, chopped', '1 pound lean ground beef', '2 (26 ounce) jars spaghetti sauce', '6 ounces provolone cheese, sliced',
        '1 ½ cups sour cream', '6 ounces mozzarella cheese, shredded', '2 tablespoons grated Parmesan cheese'] }])),
    expect: { name: 'Baked Ziti', serv: 8, total: 60, meal: 'dinner', tags: ['oven'],
      lines: { '1 ½ cups sour cream': ['sour_cream', 1.5], '1 pound lean ground beef': ['ground_beef', 1] } } },

  { site: 'NYT-style (plain block, entities)', url: 'https://cooking.example/recipes/1/sheet-pan-chicken',
    html: page('Sheet-Pan Chicken &amp; Potatoes', ld({ '@context': 'https://schema.org', '@type': 'Recipe', name: 'Sheet-Pan Chicken &amp; Potatoes',
      recipeYield: '4 servings', totalTime: 'PT50M', recipeCuisine: 'mediterranean', keywords: 'roasted, weeknight',
      recipeIngredient: ['2 pounds bone-in, skin-on chicken thighs', '1 &frac12; pounds small potatoes, halved', '3 tablespoons olive oil', '1 teaspoon dried oregano',
        '1 lemon, cut into wedges', 'Kosher salt and black pepper', '&frac14; cup fresh parsley, chopped'] })),
    expect: { name: 'Sheet-Pan Chicken & Potatoes', serv: 4, total: 50, tags: ['mediterranean', 'oven'], basics: 1,
      lines: { '3 tablespoons olive oil': ['olive_oil', 3], '1 teaspoon dried oregano': ['oregano', 1] } } },

  { site: 'Budget blog (mainEntity, yield as number)', url: 'https://budget.example/black-bean-tacos/',
    html: page('Black Bean Tacos', ld({ '@context': 'https://schema.org', '@type': 'WebPage', mainEntity: { '@type': 'Recipe', name: 'Crispy Black Bean Tacos', recipeYield: 4,
      prepTime: 'PT10M', cookTime: 'PT15M', recipeCategory: 'Main Course', recipeCuisine: 'Mexican',
      recipeIngredient: ['2 (15 oz) cans black beans, rinsed and drained', '1 tsp chili powder', '½ tsp garlic powder', '8 small flour tortillas', '1 cup shredded Mexican cheese',
        '1 avocado', '¼ cup sour cream', '2 Tbsp chopped cilantro', 'Optional: hot sauce, for serving'] } })),
    expect: { name: 'Crispy Black Bean Tacos', serv: 4, total: 25, meal: 'dinner', tags: ['mexican'],
      lines: { '2 (15 oz) cans black beans, rinsed and drained': ['black_beans', 2], '1 avocado': ['avocado', 1] }, optional: ['Optional: hot sauce, for serving'] } },

  { site: 'Serious Eats-style (breakfast, ranges)', url: 'https://eats.example/fluffy-pancakes',
    html: page('Fluffy Pancakes', ld({ '@context': 'https://schema.org', '@type': 'Recipe', name: 'Fluffy Buttermilk Pancakes', recipeYield: ['4', '12 to 16 pancakes'],
      totalTime: 'P0DT0H30M', recipeCategory: 'Breakfast',
      recipeIngredient: ['2 cups (10 ounces; 280g) all-purpose flour', '2 tablespoons sugar', '1 teaspoon baking powder', '2 large eggs', '1 1/2 to 2 cups milk',
        '4 tablespoons unsalted butter, melted', 'Maple syrup, for serving'] })),
    expect: { name: 'Fluffy Buttermilk Pancakes', serv: 4, total: 30, meal: 'breakfast',
      lines: { '2 large eggs': ['eggs', 2], '1 teaspoon baking powder': ['baking_powder', 1], '2 tablespoons sugar': ['sugar', 6] } } },

  { site: 'stir fry blog (asian, metric)', url: 'https://wok.example/beef-broccoli',
    html: page('Beef and Broccoli', ld({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Recipe', name: 'Beef and Broccoli', recipeYield: '3',
      totalTime: 'PT25M', recipeCuisine: ['Chinese'], keywords: 'stir fry',
      recipeIngredient: ['450 g flank steak, thinly sliced', '3 tbsp soy sauce', '1 tbsp oyster sauce', '1 tsp sesame oil', '2 tsp cornstarch', '15 ml rice vinegar',
        '4 cups broccoli florets', '2 cloves garlic, minced', '1 tbsp vegetable oil', '60 ml water'] }] })),
    expect: { name: 'Beef and Broccoli', serv: 3, total: 25, tags: ['chinese', 'stovetop'], basics: 1,
      lines: { '3 tbsp soy sauce': ['soy_sauce', 3], '2 cloves garlic, minced': ['garlic', 2], '15 ml rice vinegar': ['rice_vinegar', 1.014] } } },

  { site: 'Indian blog (ingredient objects, legacy "ingredients")', url: 'https://curry.example/chana-masala/',
    html: page('Chana Masala', ld({ '@context': 'https://schema.org', '@type': 'Recipe', name: 'Chana Masala', recipeYield: '4 servings', totalTime: 'PT40M',
      recipeCuisine: 'Indian', keywords: 'curry, vegan',
      ingredients: ['2 (15 ounce) cans chickpeas, drained', '1 medium onion, finely chopped', '1 tbsp ginger garlic paste', '1 (14.5 oz) can crushed tomatoes',
        '1 ½ tsp garam masala', '½ tsp turmeric', '1 tsp ground coriander', '2 tbsp oil', '1 cup water', 'Salt to taste'] })),
    expect: { name: 'Chana Masala', serv: 4, total: 40, tags: ['indian', 'spicy'], basics: 2,
      lines: { '2 (15 ounce) cans chickpeas, drained': ['chickpeas', 2], '1 ½ tsp garam masala': ['garam_masala', 1.5], '½ tsp turmeric': ['turmeric', 0.5] } } },

  { site: 'soup blog (HTML-escaped JSON in a CDATA-ish comment)', url: 'https://soup.example/chicken-noodle',
    html: page('Chicken Noodle Soup', `<script type='application/ld+json'><!--${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Recipe', name: 'Easy Chicken Noodle Soup',
      recipeYield: '6', prepTime: 'PT15M', cookTime: 'PT30M', recipeCategory: 'Soup',
      recipeIngredient: ['1 tablespoon butter', '1 cup diced onion', '1 cup chopped celery', '2 carrots, sliced', '8 cups chicken broth', '2 cups egg noodles',
        '2 cups cooked chicken, shredded', '1 teaspoon dried thyme', 'Freshly ground black pepper'] })}--></script>`),
    expect: { name: 'Easy Chicken Noodle Soup', serv: 6, total: 45, meal: 'dinner', basics: 1,
      lines: { '8 cups chicken broth': ['broth', 8], '1 tablespoon butter': ['butter', 1] } } },

  { site: 'dessert blog (snack, packages)', url: 'https://sweet.example/no-bake-cheesecake',
    html: page('No Bake Cheesecake', ld({ '@context': 'https://schema.org', '@type': 'Recipe', name: 'No-Bake Cheesecake', recipeYield: '8', totalTime: 'PT4H15M',
      recipeCategory: 'Dessert', keywords: 'no cook, summer',
      recipeIngredient: ['2 (8 oz) packages cream cheese, softened', '1/2 cup sugar', '1 teaspoon vanilla extract', '1 (14 oz) can sweetened condensed milk',
        '1 cup heavy cream', '1 graham cracker crust'] })),
    expect: { name: 'No-Bake Cheesecake', serv: 8, total: 255, meal: 'snack', tags: ['nocook'],
      lines: { '2 (8 oz) packages cream cheese, softened': ['cream_cheese_block', 16], '1 (14 oz) can sweetened condensed milk': ['condensed_milk', 1], '1 cup heavy cream': ['heavy_cream', 1] } } },

  { site: 'indianhealthyrecipes.com paneer butter masala (WP Recipe Maker, doubled parentheses)', url: 'https://www.indianhealthyrecipes.com/paneer-butter-masala-restaurant-style/',
    // Lines as the app showed them on Nelson's phone (2026-10-18), plus the rest of the card from the page.
    html: page('Paneer Butter Masala Recipe (Restaurant Style)', ld({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Recipe', name: 'Paneer Butter Masala Recipe (Restaurant Style)',
      recipeYield: ['4', '4 servings'], prepTime: 'PT15M', cookTime: 'PT30M', totalTime: 'PT40M', recipeCategory: ['Main'], recipeCuisine: ['Indian'], keywords: 'paneer butter masala, paneer makhani',
      recipeIngredient: ['1 tablespoon (15 ml) oil', '2 green cardamoms ( (or ¼ to ⅓ tsp ground cardamom, elaichi))', '1 cup (130 grams) onions ((sliced or diced from 1 medium yellow or 2 small red onions))',
        '1 inch (10 grams) ginger ((peeled &amp; sliced or use 1½ to 2 teaspoon ginger garlic paste, read notes))', '5 to 6 garlic cloves ((large, 12 grams, skip if using ginger garlic paste))',
        '2 cups (350 grams) tomatoes ((chopped, or up to 420 grams for more tomato flavor))', '15 cashews ((whole, 30 grams, or up to 18, or use almonds))', '1 teaspoon sea salt',
        '1 teaspoon jaggery or sugar ((optional))', '¾ to 1 teaspoon Kashmiri red chili powder ((or paprika))', '¾ to 1 teaspoon garam masala', '1 teaspoon coriander powder ((optional))',
        '1 cup (240 ml) water ((cold, for blending))', '2 tablespoons (30 grams) unsalted butter', '1 small bay leaf ((tej patta, optional))', '2 inch Ceylon cinnamon piece ((or 1 inch dalchini, optional))',
        '3 cloves ((laung, optional))', '250 to 300 grams (9 to 10 oz) paneer ((I cut mine to ¾ inch))', '½ tablespoon kasuri methi (dried fenugreek leaves) ((crushed))',
        '3 to 4 tablespoons (45 to 60 ml) heavy cream', '1 to 2 tablespoons coriander leaves ((chopped, for garnish))'] }] })),
    expect: { name: 'Paneer Butter Masala Recipe (Restaurant Style)', serv: 4, total: 40, tags: ['indian'], basics: 2,
      lines: { '1 tablespoon (15 ml) oil': ['oil', 1], '2 green cardamoms (or ¼ to ⅓ tsp ground cardamom, elaichi)': ['cardamom', 2], '1 cup (130 grams) onions (sliced or diced from 1 medium yellow or 2 small red onions)': ['onion', 0.287],
        '5 to 6 garlic cloves (large, 12 grams, skip if using ginger garlic paste)': ['garlic', 5.5], '1 teaspoon jaggery or sugar (optional)': ['sugar', 1], '1 teaspoon coriander powder (optional)': ['coriander', 1],
        '2 tablespoons (30 grams) unsalted butter': ['butter', 2], '1 small bay leaf (tej patta, optional)': ['bay_leaves', 1], '2 inch Ceylon cinnamon piece (or 1 inch dalchini, optional)': ['cinnamon_sticks', 1],
        '3 cloves (laung, optional)': ['cloves', 3], '½ tablespoon kasuri methi (dried fenugreek leaves) (crushed)': ['kasuri_methi', 1.5], '3 to 4 tablespoons (45 to 60 ml) heavy cream': ['heavy_cream', 0.219],
        '1 to 2 tablespoons coriander leaves (chopped, for garnish)': ['cilantro', 0.094], '250 to 300 grams (9 to 10 oz) paneer (I cut mine to ¾ inch)': [null, null] },
      optional: ['1 small bay leaf (tej patta, optional)', '3 cloves (laung, optional)', '1 teaspoon jaggery or sugar (optional)'] } },

  { site: 'page with no recipe block', url: 'https://old.example/grandmas-meatloaf.html', noBlock: true,
    html: `<html><head><title>Grandma's Meatloaf</title></head><body><nav>Home | Recipes</nav><h1>Grandma's Meatloaf</h1><p>Serves 6. Ready in 1 hour 10 minutes.</p>
      <p>This is the one my grandma made every Sunday, and it's so good.</p><h2>Ingredients</h2><ul><li>2 lbs ground beef</li><li>1 cup bread crumbs</li><li>2 eggs</li>
      <li>1 onion, finely chopped</li><li>1/2 cup ketchup</li><li>1 tbsp Worcestershire sauce</li></ul><h2>Directions</h2><ol><li>Preheat the oven to 350°F.</li>
      <li>Mix everything and bake for 1 hour.</li></ol><footer>© 2009</footer></body></html>`,
    expect: { picked: ['2 lbs ground beef', '1 cup bread crumbs', '2 eggs', '1 onion, finely chopped', '1/2 cup ketchup', '1 tbsp Worcestershire sauce'] } }
];
