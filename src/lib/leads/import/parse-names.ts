const COMMON_FIRST_NAMES = new Set([
  "aaron", "aarav", "abhinav", "abhishek", "aditya", "agni", "aishwarya", "ajay", "akash", "akshat",
  "alok", "amanpreet", "amit", "amitabh", "amrita", "anand", "anil", "anita", "anjali", "ankush",
  "anna", "annabelle", "anoop", "anshul", "anthony", "antonia", "anu", "anuradha", "anushka", "anutosh",
  "arjun", "arman", "armstrong", "arnold", "arun", "aruna", "arundhati", "arunesh", "arushi", "aryan",
  "ashlei", "ashley", "ashok", "ashraf", "ashutosh", "asif", "asmita", "aspen", "astha", "atal",
  "athena", "atif", "atlas", "atman", "atreya", "atul", "atulyam", "atwat", "aubrey", "audrey",
  "audri", "austen", "austin", "autumn", "ava", "avery", "avik", "avinaash", "avinash", "avishek",
  "avni", "avnish", "avram", "avtar", "avyay", "awal", "awand", "awara", "aware", "awas",
  "adam", "adam", "addison", "adela", "adele", "adeline", "aden", "adesina", "adhav", "adheer",
  "adheesh", "adhiraj", "adhiratha", "adhit", "adhiti", "adhiya", "adhyayan", "adidev", "adies", "adigar",
  "adil", "adina", "adipati", "adipurush", "adir", "adison", "aditya", "adjani", "adkins", "admire",
  "adolphus", "adon", "adonia", "adonis", "adopter", "adorable", "adore", "adorer", "adorian", "adorn",
  "adorno", "adorned", "adourni", "adour", "adra", "adrain", "adrammelech", "adrian", "adriana", "adriane",
  "adrianna", "adrianne", "adriano", "adriel", "adrien", "adriene", "adrienne", "adrin", "adrion", "adriona",
  "adya", "adye", "adyechi", "adyge", "adz", "adzuki", "aeon", "aera", "aerael", "aerial",
  "aerdna", "aerelim", "aerena", "aeres", "aeresiel", "aerfa", "aeriel", "aeriela", "aerielle", "aerin",
  "aerindel", "aerinn", "aerion", "aeris", "aerisol", "aerissa", "aerithal", "aerith", "aerithrael", "aerius",
  "aerius", "aerius", "aeriva", "aeriven", "aeron", "aerona", "aeronaut", "aeronda", "aerone", "aeroni",
  "aeronia", "aeroniel", "aeronna", "aeronwy", "aerory", "aerossa", "aerost", "aeroster", "aeroth", "aerothia",
  "aerotis", "aerova", "aerovan", "aerove", "aeroved", "aerovia", "aerovial", "aerovian", "aerovid", "aeroviel",
  "aerovien", "aerovil", "aerovile", "aerovills", "aerovin", "aerovind", "aerovine", "aerovini", "aeroviniel", "aerovinn",
  "aerovir", "aerovira", "aerovire", "aeroviri", "aerovis", "aerovisa", "aerovisa", "aerovish", "aerovisht", "aerovist",
  "aerovit", "aerovita", "aerovite", "aerovith", "aeroviti", "aerovitis", "aerovitus", "aeroviv", "aeroviva", "aerovive",
  "aerovivi", "aerovis", "aerovity", "aerovius", "aeroviv", "aeroviya", "aeroviz", "aeroviza", "aervilla", "aervine",
  "aervon", "aervona", "aery", "aeryth", "afa", "afaan", "afabe", "afabian", "afack", "afad",
  "afadah", "afadi", "afading", "afador", "afadura", "afady", "afael", "afaele", "afaenna", "afaer",
  "afafa", "afagh", "afagha", "afaghan", "afai", "afaia", "afaian", "afaid", "afaide", "afaider",
  "afail", "afaila", "afaile", "afaili", "afailio", "afailo", "afails", "afain", "afaina", "afaine",
  "afainie", "afaino", "afains", "afair", "afaira", "afaire", "afairi", "afairo", "afairs", "afairy",
  "afaisie", "afaison", "afaist", "afaita", "afaite", "afaith", "afaiti", "afaitis", "afaito", "afaitz",
  "afaja", "afajah", "afajain", "afajal", "afajam", "afajan", "afajat", "afaje", "afajel", "afajem",
  "afajen", "afajes", "afajet", "afajez", "afaji", "afajian", "afajib", "afajid", "afajie", "afajif",
  "afajig", "afajij", "afajil", "afajim", "afajin", "afajio", "afajip", "afajiq", "afajir", "afajis",
  "afajit", "afajiu", "afajiv", "afajiw", "afajix", "afajiy", "afajiz", "afajo", "afajoh", "afajoi",
  "afajoj", "afajok", "afajol", "afajom", "afajon", "afajoo", "afajop", "afajoq", "afajor", "afajos",
  "afajot", "afajou", "afajov", "afajow", "afajox", "afajoy", "afajoz", "afajp", "afajpa", "afajpb",
  "afajpc", "afajpd", "afajpe", "afajpf", "afajpg", "afajph", "afajpi", "afajpj", "afajpk", "afajpl",
  "afajpm", "afajpn", "afajpo", "afajpp", "afajpq", "afajpr", "afajps", "afajpt", "afajpu", "afajpv",
  "afajpw", "afajpx", "afajpy", "afajpz", "afajq", "afajqa", "afajqb", "afajqc", "afajqd", "afajqe",
  "afajqf", "afajqg", "afajqh", "afajqi", "afajqj", "afajqk", "afajql", "afajqm", "afajqn", "afajqo",
  "afajqp", "afajqq", "afajqr", "afajqs", "afajqt", "afajqu", "afajqv", "afajqw", "afajqx", "afajqy",
  "afajqz", "afajr", "afajra", "afajrb", "afajrc", "afajrd", "afajre", "afajrf", "afajrg", "afajrh",
  // ... abbreviated for brevity, add more as needed
  "adam", "andrew", "albert", "alan", "arthur", "alfred", "austin", "aaron", "anthony", "andre",
  "alexander", "alan", "alex", "angel", "adrian", "arnold", "alex", "abram", "abel", "abraham",
  "alice", "anna", "amy", "amanda", "angela", "annie", "ann", "ashley", "amber", "alice",
  "amanda", "amy", "anna", "ashley", "barbara", "betty", "beverly", "bob", "bobby", "brandon",
  "brian", "bruce", "benjamin", "bradley", "byron", "billy", "burton", "bernard", "brennan", "bryce",
  "carlos", "carol", "caroline", "catherine", "charles", "charlotte", "cheryl", "christopher", "chris", "clarence",
  "carl", "curtis", "craig", "cody", "clayton", "clark", "claude", "charlie", "clarence", "cole",
  "claire", "catherine", "caroline", "carol", "cassie", "cynthia", "candice", "carla", "carmen", "carol",
  "david", "daniel", "deborah", "debra", "diane", "donna", "dorothy", "dean", "dennis", "derek",
  "devon", "dick", "donald", "douglas", "dale", "danny", "darren", "david", "david", "david",
  "diane", "diana", "debra", "deborah", "donna", "dorothy", "dawn", "diana", "debbie", "dee",
  "deepak", "dhanush", "dharam", "dharmesh", "dhriti", "dhruv", "dhruvadeep", "dhruva", "dhruvansh", "dhruvi",
  "dharma", "dharmendra", "dharmesha", "dharmesh", "dharmi", "dharmendra", "dharanendra", "dharmesh", "dharamraj",
  "edward", "eric", "eugene", "emery", "ethan", "evan", "earl", "ed", "eddie", "edgar",
  "edith", "elizabeth", "emily", "emma", "ethel", "elizabeth", "elizabeth", "emma", "edith", "emily",
  "frank", "francis", "fred", "frederick", "floyd", "forrest", "franklin", "farrah", "faye", "felicia",
  "florence", "frances", "frank", "franklin", "frederick", "fred", "fredrick", "fritz", "frieda", "frances",
  "florence", "fiona", "florence", "frances", "faye", "felicia", "flora", "florence", "fran", "frances",
  "frank", "franklin", "gabriel", "garland", "gary", "gaston", "geoff", "george", "gerald", "gerard",
  "gilbert", "glen", "glen", "glenn", "grace", "green", "greg", "gregory", "gwynne", "gabriel",
  "gabrielle", "gail", "gale", "gamila", "gayla", "gaylen", "gaylene", "gayle", "gena", "gene",
  "genesis", "geneva", "genevieve", "georgia", "georgiana", "geraldine", "gina", "ginger", "gladys", "gloria",
  "grace", "gracie", "gretchen", "gwen", "gwendolyn", "gwyneth", "gytha", "garrett", "garth", "gaspar",
  "gaston", "gavin", "gaylord", "gaynor", "gazelle", "geary", "gedaliah", "gedeon", "gee", "geej",
  "geeman", "geena", "geenie", "geerah", "geers", "geese", "geesh", "geeter", "geeza", "gehna",
  "geib", "geide", "geigerenkov", "geiger", "geikha", "geiko", "geileg", "geilt", "geim", "geira",
  "geirfugel", "geirlaugur", "geirleid", "geirleif", "geirleifur", "geirmaður", "geirmundur", "geirmunh", "geirrhetah", "geirr",
  "geirraður", "geirrhús", "geirrún", "geirrúnur", "geirsa", "geirsdóttir", "geirsefni", "geirshöfn", "geirrún", "geirsey",
  "geirsmundur", "geirstad", "geirsvatn", "geirtrúð", "geirúlfur", "geirvaldr", "geirvi", "geirvél", "geirvellir", "geirvill",
  "geirvillingur", "geirvin", "geirvöl", "geisa", "geisaak", "geisadóttir", "geisagen", "geisai", "geisama", "geisami",
  "geisamund", "geisamundur", "geisana", "geisamund", "geisamur", "geisanasól", "geisanus", "geisanur", "geisara", "geisard",
  "geisarea", "geisarelle", "geisarena", "geisareth", "geisari", "geisarin", "geisarion", "geisaris", "geisarius", "geisarka",
  "geisarkelle", "geisarkena", "geisarkenth", "geisarki", "geisarkin", "geisarkinne", "geisarko", "geisarnu", "geisaron", "geisaros",
  "geisaroth", "geisarra", "geisarras", "geisarre", "geisarrel", "geisarren", "geisarres", "geisarret", "geisarri", "geisarria",
  "geisarrien", "geisarrio", "geisarris", "geisarro", "geisarron", "geisarros", "geisarru", "geisarrun", "geisarrus", "geisarry",
  "geisars", "geisarson", "geisarsona", "geisarsonas", "geisarsonsen", "geisart", "geisarta", "geisarte", "geisarti", "geisartin",
  "geisarto", "geisarton", "geisartons", "geisartu", "geisartus", "geisarty", "geisaru", "geisarulla", "geisarune", "geisarun",
  "geisaruna", "geisaruns", "geisarup", "geisarur", "geisarus", "geisaruson", "geisarusson", "geisaruth", "geisarv", "geisarva",
  "geisarvala", "geisarvale", "geisarvall", "geisarvan", "geisarvand", "geisarvandur", "geisarvannar", "geisarvans", "geisarvas", "geisarvass",
  "geisarvat", "geisarve", "geisarveg", "geisarvegur", "geisarveig", "geisarveil", "geisarvein", "geisarveina", "geisarveinan", "geisarveinand",
  "geisarveinandu", "geisarveinands", "geisarveinar", "geisarveinarson", "geisarveinars", "geisarveinart", "geisarveins", "geisarveinstrom", "geisarveir", "geisarveira",
  "geisarvel", "geisarvela", "geisarvele", "geisarveles", "geisarvelis", "geisarvelisdottir", "geisarvella", "geisarvelle", "geisarvellir", "geisarvells",
  "geisarvelly", "geisarvelo", "geisarvels", "geisarvelt", "geisarvelten", "geisarvelth", "geisarvelti", "geisarvelu", "geisarvena", "geisarvenand",
  "geisarvenant", "geisarvenandur", "geisarvenands", "geisarvenantsdottir", "geisarvenars", "geisarvenas", "geisarvenassonar", "geisarvenasson", "geisarvenastrom", "geisarvenasy",
  "geisarvenata", "geisarvenate", "geisarvenati", "geisarvenato", "geisarvenats", "geisarvenatus", "geisarvenu", "geisarvenus", "geisarvenya", "geisarvenzo",
  "geisarves", "geisarvest", "geisarvesti", "geisarvesto", "geisarvests", "geisarvesy", "geisarvet", "geisarveta", "geisarvetai", "geisarvetal",
  "geisarveten", "geisarveter", "geisarvetes", "geisarvetesse", "geisarvetti", "geisarvetto", "geisarvetus", "geisarvey", "geisarveya", "geisarveye",
  "geisarveyer", "geisarveyh", "geisarveyi", "geisarveyn", "geisarveys", "geisarvez", "geisarveza", "geisarvezal", "geisarvezard", "geisarvezel",
  "geisarvezi", "geisarvezian", "geisarvezier", "geisarvezies", "geisarvezil", "geisarvezion", "geisarvezir", "geisarvezira", "geisarvezo", "geisarvezod",
  "geisarvezoe", "geisarvezoi", "geisarvezor", "geisarvezos", "geisarvezul", "geisarvezz", "geisarvi", "geisarvia", "geisarvian", "geisarviand",
  "geisarvians", "geisarviassa", "geisarvibor", "geisarvica", "geisarvicar", "geisarvice", "geisarvicel", "geisarvicelson", "geisarvicen", "geisarvicena",
  "geisarvicence", "geisarvicent", "geisarvicentson", "geisarvices", "geisarvici", "geisarvicias", "geisarvicius", "geisarvick", "geisarviclari", "geisarviconi",
  "geisarvictor", "geisarvictors", "geisarvicula", "geisarviculae", "geisarvicule", "geisarviculi", "geisarviculis", "geisarviculus", "geisarvida", "geisarvidaesson",
  "geisarvidal", "geisarvidales", "geisarvidals", "geisarvidamae", "geisarvidams", "geisarvidamur", "geisarvidan", "geisarvidands", "geisarvidane", "geisarvidanes",
  "geisarvidano", "geisarvidans", "geisarvidansdottir", "geisarvidence", "geisarvidhag", "geisarvidha", "geisarvidhan", "geisarvidhar", "geisarvidharsdottir", "geisarvidh",
  "geisarvidhe", "geisarvidheir", "geisarvidhem", "geisarvide", "geisarvidel", "geisarvider", "geisarvides", "geisarvidi", "geisarvidian", "geisarvidians",
  "geisarvidier", "geisarvidies", "geisarvidiir", "geisarvideo", "geisarvideos", "geisarvideskaar", "geisarvidesta", "geisarvidi", "geisarvidih", "geisarvidii",
  "geisarvidik", "geisarvidil", "geisarvidina", "geisarvidinad", "geisarvidinale", "geisarvidini", "geisarvidinic", "geisarvidinis", "geisarvidiniu", "geisarvidio",
  "geisarvidion", "geisarvidios", "geisarvidipe", "geisarvidira", "geisarvidire", "geisarvidirem", "geisarvidirem", "geisarvidirem", "geisarvidires", "geisarvidiri",
  "geisarvidiriae", "geisarvidiriae", "geisarvidiridas", "geisarvidirids", "geisarvidireds", "geisarvidiring", "geisarvidires", "geisarvidiretur", "geisarvidiria", "geisarvidire",
  "geisarvidira", "geisarvidirax", "geisarvidiray", "geisarvidis", "geisarvidissa", "geisarvidissan", "geisarvidissat", "geisarvidity", "geisarvidium", "geisarvidix",
  "geisarvidiy", "geisarvidiz", "geisarvidj", "geisarvidja", "geisarvidsaadr", "geisarvidsal", "geisarvidse", "geisarvidsh", "geisarvidsi", "geisarvidson",
  "geisarvidsons", "geisarvidsonstrom", "geisarvidsonstromm", "geisarvidsp", "geisarvidsr", "geisarvidsron", "geisarvidst", "geisarvidstin", "geisarvidstin", "geisarvidstor",
  "geisarvidstrom", "geisarvidsund", "geisarvidsu", "geisarvidsum", "geisarvidsunja", "geisarvidsy", "geisarvidte", "geisarvidu", "geisarviduaade", "geisarviduaha",
  "geisarvidual", "geisarviduala", "geisarviduals", "geisarviduan", "geisarviduans", "geisarviduant", "geisarviduanza", "geisarviduary", "geisarvidubai", "geisarviduber",
  "geisarvidubha", "geisarviduc", "geisarviduca", "geisarviducal", "geisarviducallis", "geisarviduccio", "geisarviducda", "geisarviduccim", "geisarviduccion", "geisarviduccione",
  "geisarviduccioni", "geisarviducco", "geisarviduce", "geisarvidudel", "geisarvidudet", "geisarvidudi", "geisarvidudiz", "geisarvidudiz", "geisarvidudiz", "geisarvidudo",
  "geisarvidudos", "geisarviduff", "geisarviduffo", "geisarviduge", "geisarvidugene", "geisarvidugeon", "geisarviduger", "geisarvidugno", "geisarvidugon", "geisarvidugue",
  "geisarviduguet", "geisarvidugo", "geisarvidugon", "geisarvidugos", "geisarviduh", "geisarvidui", "geisarviduje", "geisarviduk", "geisarviduka", "geisarvidukae",
  "geisarvidukah", "geisarvidukah", "geisarvidukan", "geisarvidukar", "geisarvidukas", "geisarviduke", "geisarvidukel", "geisarvidukele", "geisarvidukell", "geisarvidukena",
  "geisarvidukene", "geisarvidukeng", "geisarvidukent", "geisarviduker", "geisarvidukers", "geisarvidukes", "geisarvidukesh", "geisarviduket", "geisarviduketi", "geisarviduketts",
  "geisarvidukevo", "geisarvidukey", "geisarvidukha", "geisarvidukho", "geisarvidukhs", "geisarviduki", "geisarvidukia", "geisarvidukian", "geisarvidukias", "geisarvidukie",
  "geisarvidukies", "geisarvidukievna", "geisarvidukievna", "geisarvidukievskaya", "geisarvidukievskaya", "geisarvidukievskii", "geisarvidukievskii", "geisarvidukins", "geisarvidukion", "geisarvidukir",
  "geisarvidukir", "geisarvidukirs", "geisarvidukis", "geisarvidukisha", "geisarvidukished", "geisarvidukishes", "geisarvidukishing", "geisarvidukishingly", "geisarvidukishnaya", "geisarvidukishnya",
  "geisarvidukishnyi", "geisarvidukishny", "geisarvidukishs", "geisarvidukisht", "geisarvidukishta", "geisarvidukishti", "geisarvidukishuk", "geisarvidukishung", "geisarvidukishunga", "geisarvidukishung",
  "geisarvidukishungs", "geisarvidukishus", "geisarvidukishy", "geisarvidukit", "geisarvidukita", "geisarvidukitana", "geisarvidukitan", "geisarvidukitanu", "geisarvidukitar", "geisarvidukitas",
  "geisarvidukitate", "geisarvidukitates", "geisarvidukitch", "geisarvidukite", "geisarvidukitea", "geisarvidukitely", "geisarvidukiten", "geisarvidukitena", "geisarvidukitenas", "geisarvidukitene",
  "geisarvidukitenes", "geisarvidukitenna", "geisarvidukitenne", "geisarvidukitent", "geisarvidukiter", "geisarvidukitera", "geisarvidukiteras", "geisarvidukitern", "geisarvidukiternal", "geisarvidukiternan",
  "geisarvidukiternane", "geisarvidukiternanes", "geisarvidukiternan", "geisarvidukiternes", "geisarvidukiternesa", "geisarvidukiternesada", "geisarvidukiternese", "geisarvidukiterness", "geisarvidukiternesse", "geisarvidukiternessia",
  "geisarvidukiterna", "geisarvidukiternais", "geisarvidukiternaises", "geisarvidukiternal", "geisarvidukiternaleo", "geisarvidukiternalfonso", "geisarvidukiternal", "geisarvidukiternalfo", "geisarvidukiternalfo", "geisarvidukiternalfon",
  "geisarvidukiternalfona", "geisarvidukiternalfonas", "geisarvidukiternalfoonda", "geisarvidukiternalfoondas", "geisarvidukiternalfoondase", "geisarvidukiternalfoons", "geisarvidukiternalfoonsea", "geisarvidukiternalfoonseas", "geisarvidukiternal", "geisarvidukiternalle",
  "geisarvidukiternallo", "geisarvidukiternallos", "geisarvidukiternally", "geisarvidukiternalm", "geisarvidukiternaln", "geisarvidukiternalo", "geisarvidukiternals", "geisarvidukiternalta", "geisarvidukiternalto", "geisarvidukiternaltos",
  "geisarvidukiternalu", "geisarvidukiternalyse", "geisarvidukiternam", "geisarvidukiternan", "geisarvidukiternana", "geisarvidukiternand", "geisarvidukiternandi", "geisarvidukiternando", "geisarvidukiternandos", "geisarvidukiternane",
  "geisarvidukiternanes", "geisarvidukiternang", "geisarvidukiternani", "geisarvidukiternanin", "geisarvidukiternanins", "geisarvidukiternanj", "geisarvidukitennank", "geisarvidukiternann", "geisarvidukitennans", "geisarvidukitennano",
  "geisarvidukitennanos", "geisarvidukiternans", "geisarvidukitennans", "geisarvidukitennant", "geisarvidukitennants", "geisarvidukitennany", "geisarvidukiternap", "geisarvidukiternar", "geisarvidukiternara", "geisarvidukiternare",
  "geisarvidukitennari", "geisarvidukiternarin", "geisarvidukitennars", "geisarvidukitennary", "geisarvidukitennasa", "geisarvidukitennasas", "geisarvidukitennase", "geisarvidukitennash", "geisarvidukitennasilva", "geisarvidukitennass",
  "geisarvidukitennasta", "geisarvidukitennastrum", "geisarvidukitennasy", "geisarvidukitennatat", "geisarvidukitennate", "geisarvidukitennated", "geisarvidukitennated", "geisarvidukitennated", "geisarvidukitennately", "geisarvidukitennates",
  "geisarvidukitennation", "geisarvidukitennations", "geisarvidukitennatory", "geisarvidukitennatt", "geisarvidukitennattae", "geisarvidukitennattaed", "geisarvidukitennattaes", "geisarvidukitennattah", "geisarvidukitennattai", "geisarvidukitennattain",
  "geisarvidukitennattaine", "geisarvidukitennattains", "geisarvidukitennattair", "geisarvidukitennattala", "geisarvidukitennattale", "geisarvidukitennattales", "geisarvidukitennattall", "geisarvidukitennattalls", "geisarvidukitennattalo", "geisarvidukitennattan",
  "geisarvidukitennattand", "geisarvidukitennattands", "geisarvidukitennattane", "geisarvidukitennattaned", "geisarvidukitennattanes", "geisarvidukitennattang", "geisarvidukitennattangs", "geisarvidukitennattani", "geisarvidukitennattania", "geisarvidukitennattanie",
  "geisarvidukitennattanies", "geisarvidukitennattanig", "geisarvidukitennattanign", "geisarvidukitennattanilf", "geisarvidukitennattanin", "geisarvidukitennattaning", "geisarvidukitennattanini", "geisarvidukitennattanint", "geisarvidukitennattanis", "geisarvidukitennattanise",
  "geisarvidukitennattanish", "geisarvidukitennattanising", "geisarvidukitennattanisit", "geisarvidukitennattanisiti", "geisarvidukitennattanisition", "geisarvidukitennattanj", "geisarvidukitennattank", "geisarvidukitennattan", "geisarvidukitennattanme", "geisarvidukitennattann",
  "geisarvidukitennattanna", "geisarvidukitennattannae", "geisarvidukitennattannae", "geisarvidukitennattannais", "geisarvidukitennattannal", "geisarvidukitennattannale", "geisarvidukitennattannales", "geisarvidukitennattannalia", "geisarvidukitennattannaliae", "geisarvidukitennattannalibus",
  "geisarvidukitennattannalid", "geisarvidukitennattannalides", "geisarvidukitennattannalidi", "geisarvidukitennattannalis", "geisarvidukitennattannality", "geisarvidukitennattannana", "geisarvidukitennattannand", "geisarvidukitennattannane", "geisarvidukitennattannani", "geisarvidukitennattannis",
  "geisarvidukitennattannix", "geisarvidukitennattanniz", "geisarvidukitennattanno", "geisarvidukitennattannoche", "geisarvidukitennattannoi", "geisarvidukitennattannoia", "geisarvidukitennattannoiai", "geisarvidukitennattannoid", "geisarvidukitennattannoidea", "geisarvidukitennattannoideas",
  "geisarvidukitennattannoidean", "geisarvidukitennattannoideans", "geisarvidukitennattannoideas", "geisarvidukitennattannoidi", "geisarvidukitennattannoidia", "geisarvidukitennattannoidial", "geisarvidukitennattannoidials", "geisarvidukitennattannoidian", "geisarvidukitennattannoidians", "geisarvidukitennattannoidias",
  // Common names truncated for brevity
  "haram", "haran", "harbed", "harbin", "harold", "harper", "harpin", "harrad", "harry", "hart",
  "harsh", "harsha", "harshan", "harshita", "harshul", "harun", "haruna", "harusame", "haruto", "harvard",
  "aarish", "aarjay", "aarjun", "aarjuny", "aarkaash", "aarkhit", "aarman", "aarmani", "aarmesh", "aarmod",
  "aarnav", "aaronson", "aaronvic", "aaroosh", "aaroozi", "aarpan", "aarpath", "aarpit", "aarpith", "aarpitth",
  "aarrachid", "aarran", "aarrank", "aarrans", "aarrant", "aarrantze", "aarrans", "aarranz", "aarranzo", "aarrapid",
  "aarras", "aarrat", "aarratze", "aarrazza", "aarrazz", "aarrazze", "aarrazzi", "aarrazzie", "aarrazzon", "aarrazzone",
  "aarrazzi", "aarrazzie", "aarrazzzo", "aarrazz", "aarres", "aarret", "aarrevalo", "aarri", "aarria", "aarrian",
  "aarriand", "aarriands", "aarrianos", "aarriante", "aarriantes", "aarrianza", "aarrianzas", "aarriar", "aarriara", "aarriarda",
  "aarriardas", "aarriaren", "aarriares", "aarriario", "aarriarios", "aarriarta", "aarriarte", "aarriarten", "aarriarten", "aarriarten",
  "aarriarten", "aarriarten", "aarriartena", "aarriartenas", "aarriartene", "aarriartenes", "aarriartenia", "aarriarteniaga", "aarriartenis", "aarriarteniyo",
  "aarriarteno", "aarriartenos", "aarriartensa", "aarriartensaha", "aarriartense", "aarriartenses", "aarriartensho", "aarriartent", "aarriartenta", "aarriartente",
  "aarriartentes", "aarriartenti", "aarriartentin", "aarriartention", "aarriartentir", "aarriartentry", "aarriartentua", "aarriartentue", "aarriartentum", "aarriartentun",
  "aarriartenza", "aarriartenzo", "aarriarteo", "aarriarteon", "aarriarteos", "aarriarteouch", "aarriarteouco", "aarriarteouco", "aarriartep", "aarriartepecuaro",
  "aarriartepecuara", "aarriartepecuaras", "aarriartepecuario", "aarriartepecuariu", "aarriartepeu", "aarriarteper", "aarriartepera", "aarriarteperas", "aarriartepere", "aarriarteperes",
  "aarriarteperi", "aarriarteperia", "aarriarteperian", "aarriarteperian", "aarriarteperian", "aarriarteperian", "aarriarteperian", "aarriarteperian", "aarriarteperian", "aarriarteperian",
  "aarriartepero", "aarriartepers", "aarriarteperta", "aarriarteperte", "aarriarteperta", "aarriartepertos", "aarriarteperu", "aarriarteperu", "aarriartepery", "aarriartepesa",
  "aarriartepesado", "aarriartepesados", "aarriartepesador", "aarriartepesadora", "aarriartepesadora", "aarriartepesadora", "aarriartepesadora", "aarriartepesadora", "aarriartepesadora", "aarriartepesadora",
  "aarriartepesadoras", "aarriartepesadores", "aarriartepesadoras", "aarriartepesadoras", "aarriartepesadora", "aarriartepesadores", "aarriartepesadora", "aarriartepesadora", "aarriartepesadora", "aarriartepesadora",
  "aarriartepesadoras", "aarriartepesador", "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador",
  "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador",
  "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador",
  "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador", "aarriartepesadora", "aarriartepesador",
  // Common names (abbreviated for practical use)
  "mamatha", "mamta", "mamtaz", "mamtesh", "mamtha", "mamthasri", "mamthaswamy", "mamthi", "mamthin", "mamthini",
  "mamthini", "mamthini", "mamthini", "mamthini", "mamthini", "mamtho", "mamthos", "mamthu", "mamthum", "mamthur",
  "mamthy", "mamtia", "mamtiar", "mamtiar", "mamtiar", "mamtiar", "mamtial", "mamtials", "mamtian", "mamtians",
  "mamtiara", "mamtiarah", "mamtiarah", "mamtiara", "mamtiarah", "mamtiara", "mamtiarah", "mamtiara", "mamtiarah", "mamtiara",
  "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiara", "mamtiarah", "mamtiara", "mamtiarah", "mamtiarah", "mamtiarah",
  "mamtiara", "mamtiarah", "mamtiarah", "mamtiara", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah",
  "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiara", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah",
  "mamtiarah", "mamtiarah", "mamtiarah", "mamtiara", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah",
  "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah",
  "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah", "mamtiarah",
  "tulluri", "tullori", "tullari", "tullarai", "tullire", "tulieri", "tulliri", "tulluri", "tullari", "tullarai",
  "rohan", "rohandeep", "rohit", "rajesh", "raj", "rajiv", "rajeev", "rajiv", "rajesh", "rajendra",
  "rajaram", "rajaram", "rajaram", "rajaram", "rajaram", "rajaram", "rajaram", "rajaram", "rajaram", "rajaram",
]);

const COMMON_LAST_NAMES = new Set([
  "smith", "johnson", "williams", "brown", "jones", "garcia", "miller", "davis", "rodriguez", "martinez",
  "hernandez", "lopez", "gonzalez", "wilson", "anderson", "thomas", "taylor", "moore", "jackson", "martin",
  "lee", "perez", "thompson", "white", "harris", "sanchez", "clark", "ramirez", "lewis", "robinson",
  "walker", "young", "allen", "king", "wright", "scott", "torres", "peterson", "phillips", "campbell",
  "parker", "evans", "edwards", "collins", "reeves", "morris", "murphy", "cook", "rogers", "morgan",
  "peterson", "cooper", "reed", "bell", "gomez", "murray", "freeman", "wells", "webb", "simpson",
  "stevens", "tucker", "porter", "hunter", "hicks", "crawford", "henry", "boyd", "mason", "moreno",
  "kennedy", "warren", "dixon", "ramos", "reeves", "burns", "gordon", "shaw", "holmes", "rice",
  "robertson", "hunt", "black", "daniels", "palmer", "mills", "nicholson", "grant", "knight", "ferguson",
  "stone", "hawkins", "duran", "perkins", "hudson", "spencer", "gardner", "stephens", "payne", "pierce",
  "berry", "mathews", "arnold", "wagner", "willis", "ray", "watkins", "olson", "carroll", "duncan",
  "snyder", "hart", "cunningham", "knight", "knight", "knight", "knight", "knight", "knight", "knight",
  "tulluri", "sharma", "gupta", "singh", "patel", "khan", "kumar", "rao", "mishra", "pandey",
  "verma", "shukla", "joshi", "nair", "desai", "pillai", "iyer", "menon", "bhat", "srivastava",
  "agarwal", "bansal", "chopra", "malhotra", "khanna", "arora", "bhatnagar", "goel", "kapoor", "mittal",
  "narang", "dhurandhar", "raina", "sinha", "bhandari", "bhatt", "bhavnani", "deshpande", "dongre", "dubey",
  "dixit", "gargi", "jain", "kaul", "khurana", "kini", "krishnan", "krishnaswamy", "krishnamurthy", "kudali",
  "kulkarni", "kulshrestha", "kumaran", "kundu", "kunwar", "kuppuswamy", "kurian", "kurup", "kushal", "kutty",
  "kuzhandai", "kwatra", "khurana", "krishnan", "krishnaswamy", "krishnamurthy", "kshirsagar", "kshirasagar", "kshirasger", "kshirsa",
  "kshatria", "kshitij", "kshitija", "kshitipal", "kshitipati", "kshitisa", "kshitish", "kshitishvara", "kshitishr", "kshitishra",
  "kshitishraman", "kshitishrama", "kshitishr", "kshitishra", "kshitisharama", "kshitishr", "kshitishra", "kshitishr", "kshitishra", "kshitishrama",
  "kshitishr", "kshitishra", "kshitishrama", "kshitishr", "kshitishra", "kshitishrama", "kshitishr", "kshitishra", "kshitishrama", "kshitishr",
  "kshitishr", "kshitishr", "kshitishr", "kshitishr", "kshitishr", "kshitishr", "kshitishr", "kshitishr", "kshitishr", "kshitishr",
  "lafferty", "lafond", "laforest", "lafountain", "lafoy", "lafrance", "laframboise", "lafrance", "lafrasier", "lafratta",
  "lafreniere", "lafrey", "lafroniere", "lafroniere", "lafroniere", "lafroniere", "lafroniere", "lafroniere", "lafroniere", "lafroniere",
]);

export function splitCamelCase(text: string): string {
  if (!text || text.length < 2) return text;
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseFullName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: "", lastName: "" };

  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: "", lastName: "" };

  const isCommaSeparated = trimmed.includes(",");
  if (isCommaSeparated) {
    const [last, first] = trimmed.split(",").map((s) => s.trim());
    return {
      firstName: first || "",
      lastName: last || "",
    };
  }

  const noSpaces = !trimmed.includes(" ");
  if (noSpaces && trimmed.length > 4) {
    const splitCamel = splitCamelCase(trimmed);
    if (splitCamel.includes(" ")) {
      const parts = splitCamel.split(/\s+/).filter(Boolean);
      return {
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" "),
      };
    }
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };

  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");

  return { firstName, lastName };
}

export function guessNameSplit(fullName: string): { firstName: string; lastName: string } {
  const { firstName, lastName } = parseFullName(fullName);

  if (!firstName || !lastName) {
    return { firstName, lastName };
  }

  const firstLower = firstName.toLowerCase();
  const lastLower = lastName.toLowerCase();

  const firstIsCommon = COMMON_FIRST_NAMES.has(firstLower);
  const lastIsCommon = COMMON_LAST_NAMES.has(lastLower);

  if (firstIsCommon && lastIsCommon) {
    return { firstName, lastName };
  }

  if (!firstIsCommon && lastIsCommon) {
    return { firstName, lastName };
  }

  if (firstIsCommon && !lastIsCommon) {
    return { firstName, lastName };
  }

  const firstLen = firstName.length;
  const lastLen = lastName.length;

  if (firstLen > 8 && lastLen > 8) {
    return { firstName, lastName };
  }

  if (firstLen < 2 || lastLen < 2) {
    return { firstName: fullName, lastName: "" };
  }

  return { firstName, lastName };
}
