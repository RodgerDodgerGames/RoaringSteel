/**
 * The states, with their Census FIPS codes and postal abbreviations. The
 * abbreviations are how the Census Bureau names states in its metro and
 * micro area names ("Boston-Cambridge-Newton, MA-NH"), which is how a
 * town's main city is found (see useTigerWeb.js). The District of Columbia
 * is listed too, for the areas around Washington.
 */
const usStates = [
  { name: 'Alabama', fips: '01', abbr: 'AL' },
  { name: 'Alaska', fips: '02', abbr: 'AK' },
  { name: 'Arizona', fips: '04', abbr: 'AZ' },
  { name: 'Arkansas', fips: '05', abbr: 'AR' },
  { name: 'California', fips: '06', abbr: 'CA' },
  { name: 'Colorado', fips: '08', abbr: 'CO' },
  { name: 'Connecticut', fips: '09', abbr: 'CT' },
  { name: 'Delaware', fips: '10', abbr: 'DE' },
  { name: 'District of Columbia', fips: '11', abbr: 'DC' },
  { name: 'Florida', fips: '12', abbr: 'FL' },
  { name: 'Georgia', fips: '13', abbr: 'GA' },
  { name: 'Hawaii', fips: '15', abbr: 'HI' },
  { name: 'Idaho', fips: '16', abbr: 'ID' },
  { name: 'Illinois', fips: '17', abbr: 'IL' },
  { name: 'Indiana', fips: '18', abbr: 'IN' },
  { name: 'Iowa', fips: '19', abbr: 'IA' },
  { name: 'Kansas', fips: '20', abbr: 'KS' },
  { name: 'Kentucky', fips: '21', abbr: 'KY' },
  { name: 'Louisiana', fips: '22', abbr: 'LA' },
  { name: 'Maine', fips: '23', abbr: 'ME' },
  { name: 'Maryland', fips: '24', abbr: 'MD' },
  { name: 'Massachusetts', fips: '25', abbr: 'MA' },
  { name: 'Michigan', fips: '26', abbr: 'MI' },
  { name: 'Minnesota', fips: '27', abbr: 'MN' },
  { name: 'Mississippi', fips: '28', abbr: 'MS' },
  { name: 'Missouri', fips: '29', abbr: 'MO' },
  { name: 'Montana', fips: '30', abbr: 'MT' },
  { name: 'Nebraska', fips: '31', abbr: 'NE' },
  { name: 'Nevada', fips: '32', abbr: 'NV' },
  { name: 'New Hampshire', fips: '33', abbr: 'NH' },
  { name: 'New Jersey', fips: '34', abbr: 'NJ' },
  { name: 'New Mexico', fips: '35', abbr: 'NM' },
  { name: 'New York', fips: '36', abbr: 'NY' },
  { name: 'North Carolina', fips: '37', abbr: 'NC' },
  { name: 'North Dakota', fips: '38', abbr: 'ND' },
  { name: 'Ohio', fips: '39', abbr: 'OH' },
  { name: 'Oklahoma', fips: '40', abbr: 'OK' },
  { name: 'Oregon', fips: '41', abbr: 'OR' },
  { name: 'Pennsylvania', fips: '42', abbr: 'PA' },
  { name: 'Rhode Island', fips: '44', abbr: 'RI' },
  { name: 'South Carolina', fips: '45', abbr: 'SC' },
  { name: 'South Dakota', fips: '46', abbr: 'SD' },
  { name: 'Tennessee', fips: '47', abbr: 'TN' },
  { name: 'Texas', fips: '48', abbr: 'TX' },
  { name: 'Utah', fips: '49', abbr: 'UT' },
  { name: 'Vermont', fips: '50', abbr: 'VT' },
  { name: 'Virginia', fips: '51', abbr: 'VA' },
  { name: 'Washington', fips: '53', abbr: 'WA' },
  { name: 'West Virginia', fips: '54', abbr: 'WV' },
  { name: 'Wisconsin', fips: '55', abbr: 'WI' },
  { name: 'Wyoming', fips: '56', abbr: 'WY' }
]

export default usStates
