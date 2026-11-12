import { cityNames, countryCodes, countryNameOverrides, provinceNames } from './locationData.js'

export { countryCodes } from './locationData.js'

export const provinces = Object.entries(provinceNames).map(([code, name]) => ({
  code,
  name,
  cities: Object.entries(cityNames)
    .filter(([city]) => city.startsWith(code.slice(0, 2)))
    .map(([code, name]) => ({ code, name })),
}))

/** 国家使用 ISO alpha-2；省市使用静态区划表的代码，避免随界面语言改变存储值。 */
export type UserLocation = {
  country: string
  province?: string
  city?: string
}

const countries = new Set(countryCodes)
const countryNames = {
  'zh-CN': new Intl.DisplayNames(['zh-CN'], { type: 'region' }),
  'en-US': new Intl.DisplayNames(['en-US'], { type: 'region' }),
}

export const getCountryName = (code: string, locale: 'zh-CN' | 'en-US'): string =>
  countries.has(code)
    ? (countryNameOverrides[locale][code] ?? countryNames[locale].of(code) ?? code)
    : ''

/** 校验本机保存的选择；城市必须属于所选省，海外位置仅保留国家。 */
export const normalizeLocation = (value: unknown): UserLocation | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const location = value as Record<string, unknown>
  const { country, province, city } = location
  if (typeof country !== 'string' || !countries.has(country)) {
    return null
  }
  if (country !== 'CN') {
    return { country }
  }
  if (province === undefined) {
    return city === undefined ? { country } : null
  }
  const region = provinces.find((item) => item.code === province)
  if (!region) {
    return null
  }
  if (city === undefined) {
    return { country, province: region.code }
  }
  const selectedCity = region.cities.find((item) => item.code === city)
  return selectedCity ? { country, province: region.code, city: selectedCity.code } : null
}
