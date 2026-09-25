import { expect, test } from '@playwright/test'

const suppliedAddresses = [
  '6800 Valley View St., Buena Park, CA 90620',
  '2677 East Alessandro Blvd., Riverside, CA 92508',
  '16850 Heacock St., Moreno Valley, CA 92551',
  '8833 Citypark Loop, Houston, TX 77013',
  '1230 Highway 114, Roanoke, TX',
  '335 Morgan Lakes Industrial Blvd., Pooler, GA',
  '300 Seabrook Pkwy., Building 2, Pooler, GA',
  '369 N Cypress (410 Tradeport Dr.), Summerville, SC',
  '4550 Quality Drive, TN',
  '3320 Lincoln Ave., Tacoma, WA 98421',
  '12005 Steele St. S., Tacoma, WA 98444',
  '2619 Ignition Dr., Jacksonville, FL 32218',
  '2861 N. Marion Dr., Building 5, Las Vegas, NV 89115',
  '12100 Emerald Pass Ave., El Paso, TX 79928',
  '2131 West Willow St., Long Beach, CA 90810',
  '3901 Brandon Rd., Joliet, IL 60436',
  '12102 Emerald Pass Ave., Building 5, El Paso, TX 79928',
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locations-theme')) localStorage.setItem('locations-theme', 'light')
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Facility 01' })).toBeVisible()
})

test('renders the exact 17-address roster with no assigned source statuses', async ({ page }) => {
  await expect(page.locator('tbody tr')).toHaveCount(17)
  const table = page.getByRole('table')
  for (const address of suppliedAddresses) await expect(table).toContainText(address)
  await expect(page.locator('.overview-panel')).toContainText('17')
  await expect(page.locator('.overview-panel')).toContainText('Unassigned')
  await expect(page.locator('.status-pill.unassigned')).toHaveCount(18)
})

test('global and list search match address, city, state name, abbreviation, and ZIP', async ({ page }) => {
  const globalSearch = page.getByPlaceholder('Search address, city, state, ZIP...')
  await globalSearch.fill('Jacksonville')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByRole('table')).toContainText('2619 Ignition Dr.')

  await globalSearch.fill('California')
  await expect(page.locator('tbody tr')).toHaveCount(4)
  await globalSearch.fill('79928')
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await globalSearch.fill('WA')
  await expect(page.locator('tbody tr')).toHaveCount(2)

  await globalSearch.fill('')
  const listSearch = page.getByPlaceholder('Search street, city, state, ZIP...')
  await listSearch.fill('Brandon Rd')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByRole('table')).toContainText('3901 Brandon Rd., Joliet, IL 60436')
})

test('local status assignments drive all filters and persist across reload', async ({ page }) => {
  const table = page.getByRole('table')

  await table.getByRole('button', { name: `Select ${suppliedAddresses[0]}` }).click()
  await page.getByLabel(`Set status for ${suppliedAddresses[0]}`).selectOption('Active')
  await table.getByRole('button', { name: `Select ${suppliedAddresses[1]}` }).click()
  await page.getByLabel(`Set status for ${suppliedAddresses[1]}`).selectOption('Coming Soon')
  await table.getByRole('button', { name: `Select ${suppliedAddresses[2]}` }).click()
  await page.getByLabel(`Set status for ${suppliedAddresses[2]}`).selectOption('Planned')

  const filter = page.getByLabel('Filter by status')
  await filter.selectOption('Active')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(table).toContainText(suppliedAddresses[0])
  await filter.selectOption('Coming Soon')
  await expect(table).toContainText(suppliedAddresses[1])
  await filter.selectOption('Planned')
  await expect(table).toContainText(suppliedAddresses[2])
  await filter.selectOption('Unassigned')
  await expect(page.locator('tbody tr')).toHaveCount(14)
  await filter.selectOption('All')
  await expect(page.locator('tbody tr')).toHaveCount(17)

  await page.reload()
  await page.getByLabel('Filter by status').selectOption('Active')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByRole('table')).toContainText(suppliedAddresses[0])
})

test('pin and row selection update the property panel without navigation', async ({ page }) => {
  const startingUrl = page.url()
  await page.locator(`.location-marker-wrap[title="${suppliedAddresses[11]}"]`).click({ force: true })
  await expect(page.getByRole('heading', { name: 'Facility 12' })).toBeVisible()
  await expect(page.locator('.detail-panel')).toContainText(suppliedAddresses[11])
  await expect(page).toHaveURL(startingUrl)

  await page.getByRole('table').getByRole('button', { name: `Select ${suppliedAddresses[9]}` }).click()
  await expect(page.getByRole('heading', { name: 'Facility 10' })).toBeVisible()
  await expect(page.locator('.detail-panel')).toContainText(suppliedAddresses[9])
  await expect(page).toHaveURL(startingUrl)
})

test('property tabs show honest unavailable states and coordinate limitations', async ({ page }) => {
  await page.getByRole('tab', { name: 'Site Plan' }).click()
  await expect(page.getByText('Site plan not provided')).toBeVisible()
  await page.getByRole('tab', { name: 'Photos' }).click()
  await expect(page.getByText('Photos not provided')).toBeVisible()
  await page.getByRole('tab', { name: 'Documents' }).click()
  await expect(page.getByText('Documents not provided')).toBeVisible()
  await page.getByRole('tab', { name: 'Operations' }).click()
  await expect(page.getByText('Operations data unavailable')).toBeVisible()

  await page.getByRole('table').getByRole('button', { name: `Select ${suppliedAddresses[15]}` }).click()
  await expect(page.getByText('Approximate').first()).toBeVisible()
  await expect(page.locator('.detail-panel')).toContainText('closest point-address match conflicts')
})

test('theme persistence and map basemap switching remain functional', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const satellite = page.getByRole('button', { name: 'Satellite' })
  const street = page.getByRole('button', { name: 'Street' })
  await expect(satellite).toHaveAttribute('aria-pressed', 'true')
  await street.click()
  await expect(street).toHaveAttribute('aria-pressed', 'true')
  await expect(satellite).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.leaflet-tile-pane img').first()).toHaveAttribute('src', /cartocdn/)
})
