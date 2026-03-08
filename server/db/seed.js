require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./connection');

async function seed() {
  console.log('Seeding development data...');

  const meals = [
    { name: 'Beef Bolognese',   category: 'Meals',       notes: 'Extra rich, slow cooked 4 hours' },
    { name: 'Chicken Soup',     category: 'Soups',       notes: null },
    { name: 'Tomato Sauce',     category: 'Sauces',      notes: 'San Marzano tomatoes' },
    { name: 'Banana Bread',     category: 'Baked Goods', notes: null },
    { name: 'Chicken Stir Fry', category: 'Meals',       notes: null },
  ];

  for (const meal of meals) {
    await pool.query(
      `INSERT INTO meals (name, category, notes) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
      [meal.name, meal.category, meal.notes]
    );
  }

  // Add batches
  const batchData = [
    { name: 'Beef Bolognese',   portions: 6, daysAgo: 5,  expiryDays: 90  },
    { name: 'Chicken Soup',     portions: 4, daysAgo: 2,  expiryDays: 180 },
    { name: 'Tomato Sauce',     portions: 2, daysAgo: 10, expiryDays: 180 },
    { name: 'Chicken Stir Fry', portions: 8, daysAgo: 1,  expiryDays: 90  },
  ];

  for (const b of batchData) {
    const { rows } = await pool.query('SELECT id FROM meals WHERE name = $1', [b.name]);
    if (!rows.length) continue;
    const mealId = rows[0].id;

    await pool.query(
      `INSERT INTO batches (meal_id, portions_remaining, freeze_date, expiry_date)
       VALUES ($1, $2, CURRENT_DATE - $3::integer * INTERVAL '1 day',
               CURRENT_DATE - $3::integer * INTERVAL '1 day' + $4::integer * INTERVAL '1 day')`,
      [mealId, b.portions, b.daysAgo, b.expiryDays]
    );
  }

  console.log('Seed complete.');
  await pool.end();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
