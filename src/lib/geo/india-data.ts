/** India geography: regions → states/UTs → districts. Compact source for Settings + Scout. */

export const INDIA_REGION_ROWS = [
  { id: "north", name: "North India" },
  { id: "west", name: "West India" },
  { id: "central", name: "Central India" },
  { id: "south", name: "South India" },
  { id: "east", name: "East India" },
  { id: "northeast", name: "Northeast India" },
] as const;

export type IndiaRegionId = (typeof INDIA_REGION_ROWS)[number]["id"];

/** District string: OfficialName or OfficialName|alias|alias */
export const INDIA_STATE_ROWS: ReadonlyArray<{
  id: string;
  name: string;
  regionId: IndiaRegionId;
  districts: readonly string[];
}> = [
  {
    id: "JK",
    name: "Jammu and Kashmir",
    regionId: "north",
    districts: [
      "Anantnag", "Bandipora", "Baramulla", "Budgam", "Doda", "Ganderbal", "Jammu", "Kathua",
      "Kishtwar", "Kulgam", "Kupwara", "Poonch", "Pulwama", "Rajouri", "Ramban", "Reasi", "Samba",
      "Shopian", "Srinagar", "Udhampur",
    ],
  },
  {
    id: "LA",
    name: "Ladakh",
    regionId: "north",
    districts: [
      "Kargil", "Leh",
    ],
  },
  {
    id: "HP",
    name: "Himachal Pradesh",
    regionId: "north",
    districts: [
      "Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Lahaul and Spiti", "Mandi",
      "Shimla", "Sirmaur", "Solan", "Una",
    ],
  },
  {
    id: "PB",
    name: "Punjab",
    regionId: "north",
    districts: [
      "Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka", "Ferozepur",
      "Gurdaspur", "Hoshiarpur", "Jalandhar", "Kapurthala", "Ludhiana", "Malerkotla", "Mansa",
      "Moga", "Muktsar", "Pathankot", "Patiala", "Rupnagar",
      "Sahibzada Ajit Singh Nagar|Mohali|SAS Nagar", "Sangrur",
      "Shahid Bhagat Singh Nagar|Nawanshahr", "Tarn Taran",
    ],
  },
  {
    id: "CH",
    name: "Chandigarh",
    regionId: "north",
    districts: [
      "Chandigarh",
    ],
  },
  {
    id: "UK",
    name: "Uttarakhand",
    regionId: "north",
    districts: [
      "Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar", "Nainital",
      "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal", "Udham Singh Nagar",
      "Uttarkashi",
    ],
  },
  {
    id: "HR",
    name: "Haryana",
    regionId: "north",
    districts: [
      "Ambala", "Bhiwani", "Charkhi Dadri", "Faridabad", "Fatehabad", "Gurugram|Gurgaon", "Hisar",
      "Jhajjar", "Jind", "Kaithal", "Karnal", "Kurukshetra", "Mahendragarh", "Nuh", "Palwal",
      "Panchkula", "Panipat", "Rewari", "Rohtak", "Sirsa", "Sonipat", "Yamunanagar",
    ],
  },
  {
    id: "DL",
    name: "Delhi",
    regionId: "north",
    districts: [
      "Central Delhi|Delhi|New Delhi", "East Delhi", "New Delhi", "North Delhi",
      "North East Delhi", "North West Delhi", "Shahdara", "South Delhi", "South East Delhi",
      "South West Delhi", "West Delhi",
    ],
  },
  {
    id: "RJ",
    name: "Rajasthan",
    regionId: "north",
    districts: [
      "Ajmer", "Alwar", "Anupgarh", "Balotra", "Banswara", "Baran", "Barmer", "Beawar",
      "Bharatpur", "Bhilwara", "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa", "Deeg",
      "Dholpur", "Didwana-Kuchaman", "Dudu", "Dungarpur", "Gangapur City", "Hanumangarh", "Jaipur",
      "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Karauli", "Kekri",
      "Khairthal-Tijara", "Kota", "Kotputli-Behror", "Nagaur", "Neem Ka Thana", "Pali", "Phalodi",
      "Pratapgarh", "Rajsamand", "Salumbar", "Sanchore", "Sawai Madhopur", "Shahpura", "Sikar",
      "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur",
    ],
  },
  {
    id: "UP",
    name: "Uttar Pradesh",
    regionId: "north",
    districts: [
      "Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya", "Ayodhya|Faizabad",
      "Azamgarh", "Baghpat", "Bahraich", "Ballia", "Balrampur", "Banda", "Barabanki", "Bareilly",
      "Basti", "Bhadohi", "Bijnor", "Budaun", "Bulandshahr", "Chandauli", "Chitrakoot", "Deoria",
      "Etah", "Etawah", "Farrukhabad", "Fatehpur", "Firozabad",
      "Gautam Buddha Nagar|Noida|Greater Noida", "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur",
      "Hamirpur", "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi", "Kannauj",
      "Kanpur Dehat", "Kanpur Nagar|Kanpur", "Kasganj", "Kaushambi", "Kheri", "Kushinagar",
      "Lalitpur", "Lucknow", "Maharajganj", "Mahoba", "Mainpuri", "Mathura", "Mau", "Meerut",
      "Mirzapur", "Moradabad", "Muzaffarnagar", "Pilibhit", "Pratapgarh", "Prayagraj|Allahabad",
      "Raebareli", "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar", "Shahjahanpur", "Shamli",
      "Shravasti", "Siddharthnagar", "Sitapur", "Sonbhadra", "Sultanpur", "Unnao", "Varanasi",
    ],
  },
  {
    id: "GJ",
    name: "Gujarat",
    regionId: "west",
    districts: [
      "Ahmedabad", "Amreli", "Anand", "Aravalli", "Banaskantha", "Bharuch", "Bhavnagar", "Botad",
      "Chhota Udaipur", "Dahod", "Dang", "Devbhumi Dwarka", "Gandhinagar", "Gir Somnath",
      "Jamnagar", "Junagadh", "Kheda", "Kutch", "Mahisagar", "Mehsana", "Morbi", "Narmada",
      "Navsari", "Panchmahal", "Patan", "Porbandar", "Rajkot", "Sabarkantha", "Surat",
      "Surendranagar", "Tapi", "Vadodara|Baroda", "Valsad",
    ],
  },
  {
    id: "DD",
    name: "Dadra and Nagar Haveli and Daman and Diu",
    regionId: "west",
    districts: [
      "Dadra and Nagar Haveli", "Daman", "Diu",
    ],
  },
  {
    id: "MH",
    name: "Maharashtra",
    regionId: "west",
    districts: [
      "Ahilyanagar|Ahmednagar", "Akola", "Amravati", "Beed", "Bhandara", "Buldhana", "Chandrapur",
      "Chhatrapati Sambhajinagar|Aurangabad", "Dharashiv|Osmanabad", "Dhule", "Gadchiroli",
      "Gondia", "Hingoli", "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City|Mumbai|Bombay",
      "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar", "Nashik", "Palghar", "Parbhani", "Pune",
      "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha",
      "Washim", "Yavatmal",
    ],
  },
  {
    id: "GA",
    name: "Goa",
    regionId: "west",
    districts: [
      "North Goa|Panaji|Panjim", "South Goa|Margao",
    ],
  },
  {
    id: "MP",
    name: "Madhya Pradesh",
    regionId: "central",
    districts: [
      "Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul", "Bhind",
      "Bhopal", "Burhanpur", "Chhatarpur", "Chhindwara", "Damoh", "Datia", "Dewas", "Dhar",
      "Dindori", "Guna", "Gwalior", "Harda", "Indore", "Jabalpur", "Jhabua", "Katni", "Khandwa",
      "Khargone", "Mandla", "Mandsaur", "Morena", "Narmadapuram|Hoshangabad", "Narsinghpur",
      "Neemuch", "Niwari", "Panna", "Raisen", "Rajgarh", "Ratlam", "Rewa", "Sagar", "Satna",
      "Sehore", "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi", "Singrauli",
      "Tikamgarh", "Ujjain", "Umaria", "Vidisha",
    ],
  },
  {
    id: "CG",
    name: "Chhattisgarh",
    regionId: "central",
    districts: [
      "Balod", "Baloda Bazar", "Balrampur", "Bastar", "Bemetara", "Bijapur", "Bilaspur",
      "Dantewada", "Dhamtari", "Durg", "Gariaband", "Gaurela-Pendra-Marwahi", "Janjgir-Champa",
      "Jashpur", "Kabirdham", "Kanker", "Khairagarh-Chhuikhadan-Gandai", "Kondagaon", "Korba",
      "Korea", "Mahasamund", "Manendragarh-Chirmiri-Bharatpur", "Mohla-Manpur-Ambagarh Chowki",
      "Mungeli", "Narayanpur", "Raigarh", "Raipur", "Rajnandgaon", "Sarangarh-Bilaigarh", "Sakti",
      "Sukma", "Surajpur", "Surguja",
    ],
  },
  {
    id: "TS",
    name: "Telangana",
    regionId: "south",
    districts: [
      "Adilabad", "Bhadradri Kothagudem", "Hanamkonda|Warangal", "Hyderabad", "Jagtial", "Jangaon",
      "Jayashankar Bhupalpally", "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam",
      "Komaram Bheem", "Mahabubabad", "Mahabubnagar", "Mancherial", "Medak", "Medchal-Malkajgiri",
      "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet", "Nirmal", "Nizamabad", "Peddapalli",
      "Rajanna Sircilla", "Rangareddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad",
      "Wanaparthy", "Warangal", "Yadadri Bhuvanagiri",
    ],
  },
  {
    id: "AP",
    name: "Andhra Pradesh",
    regionId: "south",
    districts: [
      "Alluri Sitharama Raju", "Anakapalli", "Anantapur", "Annamayya", "Bapatla", "Chittoor",
      "Dr. B.R. Ambedkar Konaseema", "East Godavari", "Eluru", "Guntur", "Kakinada", "Krishna",
      "Kurnool", "Nandyal", "NTR|Vijayawada", "Palnadu", "Parvathipuram Manyam", "Prakasam",
      "Sri Potti Sriramulu Nellore|Nellore", "Sri Sathya Sai", "Srikakulam", "Tirupati",
      "Visakhapatnam|Vizag", "Vizianagaram", "West Godavari", "YSR Kadapa|Kadapa|Cuddapah",
    ],
  },
  {
    id: "KA",
    name: "Karnataka",
    regionId: "south",
    districts: [
      "Bagalkot", "Ballari|Bellary", "Belagavi|Belgaum", "Bengaluru Rural",
      "Bengaluru Urban|Bengaluru|Bangalore", "Bidar", "Chamarajanagar", "Chikkaballapur",
      "Chikkamagaluru", "Chitradurga", "Dakshina Kannada|Mangalore|Mangaluru", "Davanagere",
      "Dharwad|Hubli|Hubballi", "Gadag", "Hassan", "Haveri", "Kalaburagi|Gulbarga", "Kodagu",
      "Kolar", "Koppal", "Mandya", "Mysuru|Mysore", "Raichur", "Ramanagara", "Shivamogga|Shimoga",
      "Tumakuru|Tumkur", "Udupi", "Uttara Kannada|Karwar", "Vijayanagara", "Vijayapura|Bijapur",
      "Yadgir",
    ],
  },
  {
    id: "KL",
    name: "Kerala",
    regionId: "south",
    districts: [
      "Alappuzha", "Ernakulam|Kochi|Cochin", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam",
      "Kozhikode|Calicut", "Malappuram", "Palakkad", "Pathanamthitta",
      "Thiruvananthapuram|Trivandrum", "Thrissur", "Wayanad",
    ],
  },
  {
    id: "TN",
    name: "Tamil Nadu",
    regionId: "south",
    districts: [
      "Ariyalur", "Chengalpattu", "Chennai|Madras", "Coimbatore", "Cuddalore", "Dharmapuri",
      "Dindigul", "Erode", "Kallakurichi", "Kancheepuram", "Kanniyakumari", "Karur",
      "Krishnagiri|Hosur", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris",
      "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi",
      "Thanjavur", "Theni", "Thoothukudi|Tuticorin", "Tiruchirappalli|Trichy", "Tirunelveli",
      "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore",
      "Viluppuram", "Virudhunagar",
    ],
  },
  {
    id: "PY",
    name: "Puducherry",
    regionId: "south",
    districts: [
      "Karaikal", "Mahe", "Puducherry|Pondicherry", "Yanam",
    ],
  },
  {
    id: "LD",
    name: "Lakshadweep",
    regionId: "south",
    districts: [
      "Lakshadweep",
    ],
  },
  {
    id: "AN",
    name: "Andaman and Nicobar Islands",
    regionId: "south",
    districts: [
      "Nicobar", "North and Middle Andaman", "South Andaman|Port Blair",
    ],
  },
  {
    id: "BR",
    name: "Bihar",
    regionId: "east",
    districts: [
      "Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar",
      "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur",
      "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger",
      "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur",
      "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali",
      "West Champaran",
    ],
  },
  {
    id: "JH",
    name: "Jharkhand",
    regionId: "east",
    districts: [
      "Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum|Jamshedpur", "Garhwa",
      "Giridih", "Godda", "Gumla", "Hazaribagh", "Jamtara", "Khunti", "Koderma", "Latehar",
      "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi", "Sahebganj", "Seraikela Kharsawan",
      "Simdega", "West Singhbhum",
    ],
  },
  {
    id: "OD",
    name: "Odisha",
    regionId: "east",
    districts: [
      "Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", "Cuttack", "Deogarh",
      "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghpur", "Jajpur", "Jharsuguda", "Kalahandi",
      "Kandhamal", "Kendrapara", "Kendujhar", "Khordha|Bhubaneswar", "Koraput", "Malkangiri",
      "Mayurbhanj", "Nabarangpur", "Nayagarh", "Nuapada", "Puri", "Rayagada", "Sambalpur",
      "Subarnapur", "Sundargarh",
    ],
  },
  {
    id: "WB",
    name: "West Bengal",
    regionId: "east",
    districts: [
      "Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur", "Darjeeling",
      "Hooghly", "Howrah", "Jalpaiguri", "Jhargram", "Kalimpong", "Kolkata|Calcutta", "Malda",
      "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman", "Paschim Medinipur",
      "Purba Bardhaman", "Purba Medinipur", "Purulia", "South 24 Parganas", "Uttar Dinajpur",
    ],
  },
  {
    id: "SK",
    name: "Sikkim",
    regionId: "northeast",
    districts: [
      "Gangtok", "Gyalshing", "Mangan", "Namchi", "Pakyong", "Soreng",
    ],
  },
  {
    id: "AS",
    name: "Assam",
    regionId: "northeast",
    districts: [
      "Bajali", "Baksa", "Barpeta", "Biswanath", "Bongaigaon", "Cachar", "Charaideo", "Chirang",
      "Darrang", "Dhemaji", "Dhubri", "Dibrugarh", "Dima Hasao", "Goalpara", "Golaghat",
      "Hailakandi", "Hojai", "Jorhat", "Kamrup", "Kamrup Metropolitan|Guwahati", "Karbi Anglong",
      "Karimganj", "Kokrajhar", "Lakhimpur", "Majuli", "Morigaon", "Nagaon", "Nalbari",
      "Sivasagar", "Sonitpur", "South Salmara-Mankachar", "Tamulpur", "Tinsukia", "Udalguri",
      "West Karbi Anglong",
    ],
  },
  {
    id: "AR",
    name: "Arunachal Pradesh",
    regionId: "northeast",
    districts: [
      "Anjaw", "Bichom", "Changlang", "Dibang Valley", "East Kameng", "East Siang", "Kamle",
      "Keyi Panyor", "Kra Daadi", "Kurung Kumey", "Lepa Rada", "Lohit", "Longding",
      "Lower Dibang Valley", "Lower Siang", "Lower Subansiri", "Namsai", "Pakke Kessang",
      "Papum Pare|Itanagar", "Shi Yomi", "Siang", "Tawang", "Tirap", "Upper Siang",
      "Upper Subansiri", "West Kameng", "West Siang",
    ],
  },
  {
    id: "NL",
    name: "Nagaland",
    regionId: "northeast",
    districts: [
      "Chumoukedima", "Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", "Niuland",
      "Noklak", "Peren", "Phek", "Shamator", "Tseminyu", "Tuensang", "Wokha", "Zunheboto",
    ],
  },
  {
    id: "MN",
    name: "Manipur",
    regionId: "northeast",
    districts: [
      "Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West|Imphal", "Jiribam",
      "Kakching", "Kamjong", "Kangpokpi", "Noney", "Pherzawl", "Senapati", "Tamenglong",
      "Tengnoupal", "Thoubal", "Ukhrul",
    ],
  },
  {
    id: "MZ",
    name: "Mizoram",
    regionId: "northeast",
    districts: [
      "Aizawl", "Champhai", "Hnahthial", "Khawzawl", "Kolasib", "Lawngtlai", "Lunglei", "Mamit",
      "Saitual", "Serchhip", "Siaha",
    ],
  },
  {
    id: "TR",
    name: "Tripura",
    regionId: "northeast",
    districts: [
      "Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala", "South Tripura", "Unakoti",
      "West Tripura|Agartala",
    ],
  },
  {
    id: "ML",
    name: "Meghalaya",
    regionId: "northeast",
    districts: [
      "East Garo Hills", "East Jaintia Hills", "East Khasi Hills|Shillong",
      "Eastern West Khasi Hills", "North Garo Hills", "Ri Bhoi", "South Garo Hills",
      "South West Garo Hills", "South West Khasi Hills", "West Garo Hills", "West Jaintia Hills",
      "West Khasi Hills",
    ],
  },
];
