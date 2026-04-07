    import { useNavigate, useLocation } from "react-router-dom";

    const Dashboard = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const menu = [
        { name: "Sales", path: "/sale" },
        { name: "Store", path: "/store" },
        { name: "AI Chat", path: "/chat" }
    ];

    return (
        <div className="min-h-screen bg-gray-100 flex">
        
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-lg p-5 flex flex-col">
            
            {/* Logo */}
            <h1 className="text-xl font-bold text-blue-600 mb-8">
            Retail AI
            </h1>

            {/* Menu */}
            <div className="flex flex-col gap-2">
            {menu.map((item) => (
                <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`text-left px-4 py-2 rounded-lg transition ${
                    location.pathname === item.path
                    ? "bg-blue-500 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                >
                {item.name}
                </button>
            ))}
            </div>

        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
            
            {/* Header */}
            <div className="bg-white shadow-md rounded-2xl p-6 mb-6">
            <h1 className="text-3xl font-bold text-gray-800">
                Retail Intelligence Chat-Bot
            </h1>
            <p className="text-gray-500 mt-1">
                Smart insights for your retail business
            </p>
            </div>

            {/* Welcome Card */}
            <div className="bg-white shadow-lg rounded-2xl p-10 text-center">
            <h2 className="text-2xl font-semibold text-gray-700 mb-3">
                Welcome 👋
            </h2>
            <p className="text-gray-500">
                Use the sidebar to manage sales, stock, and interact with AI.
            </p>
            </div>

        </div>
        </div>
    );
    };

    export default Dashboard;