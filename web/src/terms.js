export const termDictionary = {
  GeographicLocation: 'Localização',
  GeographicAddress: 'Endereço',
  GeographicSite: 'Site',
  GeographicSiteSpecification: 'Tipo de Site',
  Location: 'Localização',
  Address: 'Endereço',
  Site: 'Site',
  'Site Spec': 'Tipo de Site',
  'Site Specification': 'Tipo de Site',
  Locations: 'Localizações',
  Addresses: 'Endereços',
  Sites: 'Sites',
  Specs: 'Tipos de Site',
};

export const t = (value) => termDictionary[value] ?? value;
