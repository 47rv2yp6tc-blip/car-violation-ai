import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const countries = require('../data/locations.json');

const normalize = (value) => String(value || '').trim().toLocaleLowerCase();

function matchesCountry(item, value) {
  const valueCode = String(value?.countryCode || '').toUpperCase();
  if (valueCode && String(item?.countryCode || '').toUpperCase() === valueCode) {
    return true;
  }

  const itemNames = [
    item?.countryName,
    item?.localizedName,
    item?.localName,
    item?.localisedName,
    item?.name,
  ].map(normalize).filter(Boolean);

  const valueNames = [
    value?.countryName,
    value?.localizedName,
    value?.localName,
    value?.localisedName,
    value?.name,
  ].map(normalize).filter(Boolean);

  return valueNames.some((candidate) => itemNames.includes(candidate));
}

export function normalizeLocation(value) {
  if (!value || typeof value !== 'object') return null;
  const country = countries.find((item) => matchesCountry(item, value));
  return {
    countryCode: country?.countryCode || null,
    countryName: country?.countryName || null,
    region: value.region ? String(value.region).slice(0, 120) : null,
    city: value.city ? String(value.city).slice(0, 120) : null,
    district: value.district ? String(value.district).slice(0, 120) : null,
    street: value.street ? String(value.street).slice(0, 200) : null,
    latitude: Number.isFinite(Number(value.latitude)) ? Number(value.latitude) : null,
    longitude: Number.isFinite(Number(value.longitude)) ? Number(value.longitude) : null,
    currencyCode: country?.currencyCode || null,
  };
}

export function locationRuleStatus(location) {
  if (!location || typeof location !== 'object') return 'location_not_selected';
  return location.countryCode ? 'no_country_rule_data' : 'location_not_selected';
}
