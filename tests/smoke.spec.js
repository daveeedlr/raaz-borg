const { test, expect } = require('@playwright/test');
const { captureRuntimeErrors, assertNoRuntimeErrors, assertLocalAssetsAndLinks, assertResponsive } = require('./helpers');

test('site navigation, local assets, and internal links stay healthy', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/');
  await expect(page.locator('nav')).toBeVisible();
  await page.locator('nav a[href="fighters.html"]').click();
  await expect(page).toHaveURL(/fighters\.html$/);
  await expect(page.locator('.realm-flip-card')).toHaveCount(8);
  await assertLocalAssetsAndLinks(page);
  await assertNoRuntimeErrors(errors);
});

test('fighter cards reveal one profile at a time and return to the front', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/fighters.html');
  const cards = page.locator('.realm-flip-card');
  await cards.nth(0).click();
  await expect(cards.nth(0)).toHaveClass(/is-flipped/);
  await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await cards.nth(1).click();
  await expect(cards.nth(0)).not.toHaveClass(/is-flipped/);
  await expect(cards.nth(1)).toHaveClass(/is-flipped/);
  await cards.nth(1).click();
  await expect(cards.nth(1)).not.toHaveClass(/is-flipped/);
  await assertNoRuntimeErrors(errors);
});

test('Grand Prix filter handles unverified editions and restores the full roster', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/fighters.html');
  const cards = page.locator('.realm-flip-card');
  await page.locator('#gpRosterFilter').selectOption('gp-1');
  await expect(cards).toHaveCount(8);
  await expect(page.locator('#gpRosterEmpty')).toBeVisible();
  await expect(cards.first()).toBeHidden();
  await page.locator('#gpRosterFilter').selectOption('all');
  await expect(page.locator('#gpRosterEmpty')).toBeHidden();
  await expect(cards.first()).toBeVisible();
  await assertNoRuntimeErrors(errors);
});

test('fighter page fits a mobile viewport', async ({ page }) => {
  await assertResponsive(page, '/fighters.html');
  await expect(page.locator('.realm-roster-grid')).toBeVisible();
});

test('Realm Nexus process navigation works without page-script exceptions', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/realm-nexus.html?lang=en');
  await expect(page.locator('#track .realm-card')).toHaveCount(7);
  await expect(page.locator('#realmTitle')).toHaveText('WHITE CARBON COMBAT');
  await page.locator('#next').click();
  await expect(page.locator('#realmTitle')).toHaveText('ZAPHIRE TRIALS');
  await page.locator('#prev').click();
  await expect(page.locator('#realmTitle')).toHaveText('WHITE CARBON COMBAT');
  await expect(page.locator('#processNumber')).toHaveText('PROTOCOL 01 / 06');
  await page.locator('#processNext').click();
  await expect(page.locator('#processNumber')).toHaveText('PROTOCOL 02 / 06');
  await expect(page.locator('#processTitle')).toContainText('ROSTER & REGISTRATION');
  await page.locator('#processPrev').click();
  await expect(page.locator('#processNumber')).toHaveText('PROTOCOL 01 / 06');
  await assertNoRuntimeErrors(errors);
});

test('shop product lightbox still opens and closes', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/shop.html');
  const lightbox = page.locator('#productLightbox');
  await expect(lightbox).toBeHidden();
  await page.locator('.product-gallery img').first().click();
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator('#lightboxImage')).toHaveAttribute('src', /white-set\.png/);
  await lightbox.locator('.lightbox-close').click();
  await expect(lightbox).toBeHidden();
  await assertNoRuntimeErrors(errors);
});

test('Spanish-first realm map, English links and saved preference work on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('link', { name: 'Explorar los reinos', exact: true })).toHaveAttribute('href', '#reinos');
  await expect(page.locator('.realm-preview')).toHaveCount(7);
  await expect(page.locator('.realm-preview img')).toHaveCount(7);
  await expect(page.locator('.hero .kicker')).toContainText('QUITO');
  await page.locator('#langToggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#burger').click();
  await page.getByRole('navigation').getByRole('link', { name: 'Fighters' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/?lang=es');
  const next = page.getByRole('button', { name: 'Siguiente', exact: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await next.click();
  await expect.poll(() => page.locator('#realm-deck').evaluate(deck => deck.scrollLeft)).toBeGreaterThan(150);
  const oxide = page.locator('.realm-preview').nth(3);
  await oxide.locator('summary').click();
  await expect(oxide).toHaveAttribute('open', '');
  await expect(oxide.locator('.realm-rank')).toHaveText('Experto');
  await expect(page.locator('#realm-deck a')).toHaveCount(7);
  const channel = 'https://www.youtube.com/@raazborg2020/featured';
  const video = 'https://www.youtube.com/watch?v=QzLvQCTzAXY&list=PLbhNwfZ6E0sGrxPPlNdXm1gRO0bnbgAMg';
  await expect(oxide.getByRole('link', { name: 'Ver Oxide en YouTube' })).toHaveAttribute('href', video);
  const otherCards = page.locator('.realm-preview:not(#realm-oxide)');
  for (const card of await otherCards.all()) {
    await expect(card.locator('.realm-reverse a')).toHaveAttribute('href', channel);
  }
  await page.goto('/clashes.html#gp-oxide-overdrive');
  await expect(page.locator('#gpArchiveTitle')).toHaveText('Oxide Overdrive');
  await expect(page.locator('#gpArchiveOverlay')).toBeVisible();
});

test('athlete inquiry validates, prepares a private email draft and supports both languages', async ({ page }) => {
  await page.goto('/');
  await page.locator('.hero-ctas').getByRole('link', { name: 'Quiero competir' }).click();
  await page.getByRole('button', { name: 'Preparar correo' }).click();
  await expect(page.locator('#email-preview')).toBeHidden();
  await page.getByLabel('Nombre o alias').fill('Atleta de prueba');
  await page.getByLabel('Correo electrónico').fill('test@example.com');
  await page.getByLabel('Ciudad', { exact: true }).fill('Quito');
  await page.getByLabel('Disciplina o cinturón').fill('BJJ');
  await page.getByLabel('Me interesa').selectOption('gp');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Preparar correo' }).click();
  await expect(page.locator('#send-inquiry')).toHaveAttribute('href', /^mailto:raazborgstudios@gmail\.com\?/);
  await expect(page.locator('#email-body')).toHaveValue(/Interés: Competir en el Grand Prix/);
  await page.locator('#langToggle').click();
  await expect(page.locator('#email-body')).toHaveValue(/Interest: Competing in the Grand Prix/);
  await page.getByLabel('City', { exact: true }).fill('Tumbaco');
  await expect(page.locator('#email-preview')).toBeHidden();
});


test('realm cards retain the whole poster and open one accessible reverse at a time', async ({ page }) => {
  await page.goto('/?lang=en#reinos');
  const cards = page.locator('.realm-preview');
  const first = cards.first();
  const second = cards.nth(1);
  await expect(first.locator('img')).toHaveCSS('object-fit', 'contain');
  await expect(first.locator('.realm-rank')).toBeHidden();
  const artwork = await first.locator('img').boundingBox();
  expect(artwork.height).toBeGreaterThan(artwork.width);
  const front = await first.boundingBox();
  await first.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(first.locator('.realm-rank')).toBeVisible();
  await expect(first.locator('.realm-rank')).toHaveText('Beginner');
  expect((await first.boundingBox()).height).toBeCloseTo(front.height, 0);
  await first.locator('.realm-reverse h3').click();
  await expect(first).not.toHaveAttribute('open', '');
  await expect(first.locator('summary')).toBeFocused();
  await first.locator('summary').press('Enter');
  await second.locator('summary').press('Space');
  await expect(first).not.toHaveAttribute('open', '');
  await expect(second).toHaveAttribute('open', '');
  await expect(second.locator('.realm-rank')).toHaveText('Intermediate');
  const summary = second.locator('.realm-reverse p [data-en]');
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute('data-en', /\S/);
  await expect(summary).toHaveText(await summary.getAttribute('data-en'));
  await second.locator('summary').press('Enter');
  await expect(second).not.toHaveAttribute('open', '');
});


test.describe('mobile realm navigation', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });

  test('tapping the back closes the card and destination links work in both languages', async ({ page }) => {
    await page.goto('/?lang=es#reinos');
    const card = page.locator('.realm-preview').first();
    await card.locator('summary').tap();
    const channelLink = card.getByRole('link', { name: 'Ver el canal de YouTube' });
    await page.context().route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '' }));
    const popupPromise = page.waitForEvent('popup');
    await channelLink.tap();
    const popup = await popupPromise;
    await expect(popup).toHaveURL('https://www.youtube.com/@raazborg2020/featured');
    await popup.close();
    await expect(card).toHaveAttribute('open', '');
    await card.locator('.realm-reverse p').tap();
    await expect(card).not.toHaveAttribute('open', '');
    const routes = page.locator('.atlas-related');
    await expect(routes.getByRole('link', { name: 'Conocer a los peleadores' })).toHaveAttribute('href', 'fighters.html');
    await expect(routes.getByRole('link', { name: 'Cómo funciona la clasificación' })).toHaveAttribute('href', 'realm-nexus.html');
    await page.locator('#langToggle').tap();
    await routes.getByRole('link', { name: 'How qualification works' }).tap();
    await expect(page).toHaveURL(/realm-nexus\.html$/);
  });
});

test('Clashes points to one bilingual set of realm cards and old realm bookmarks open the matching card', async ({ page }) => {
  await page.goto('/clashes.html?lang=es');
  await expect(page.locator('.clashes-realm-card')).toHaveCount(0);
  await page.getByRole('link', { name: 'Encuentra tu reino según tu experiencia' }).click();
  await expect(page).toHaveURL(/index\.html#reinos$/);
  const ranks = page.locator('#realm-deck .realm-rank');
  await expect(ranks).toHaveText(['Principiante', 'Intermedio', 'Avanzado', 'Experto', 'Élite', 'Maestro', 'Gran maestro']);
  await page.locator('#langToggle').click();
  await expect(ranks).toHaveText(['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Elite', 'Master', 'Grandmaster']);
  await page.goto('/clashes.html?lang=en#realm-oxide');
  await expect(page).toHaveURL(/index\.html\?lang=en#realm-oxide$/);
  await expect(page.locator('#realm-oxide')).toHaveAttribute('open', '');
  await expect(page.locator('#realm-oxide').getByRole('link', { name: 'Watch Oxide on YouTube' })).toBeVisible();
  const oxideSummary = page.locator('#realm-oxide .realm-reverse p [data-en]');
  await expect(oxideSummary).toBeVisible();
  await expect(oxideSummary).toHaveAttribute('data-en', /\S/);
  await expect(oxideSummary).toHaveText(await oxideSummary.getAttribute('data-en'));
});
