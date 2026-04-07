import { useState, useEffect } from "react";
import axios from "axios";

const Sale = () => {
  const [sale, setSale] = useState({
    customerName: "",
    mobile: "",
    productName: "",
    quantity: ""
  });

  const [items, setItems] = useState([]);

  const handleChange = (e) => {
    setSale({
      ...sale,
      [e.target.name]: e.target.value
    });
  };

  const fetchItems = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/store/names");
      setItems(res.data);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleSale = async () => {
    try {
      await axios.post("http://localhost:5000/api/sales/add", sale);

      alert("✅ Sale successful");

      setSale({
        customerName: "",
        mobile: "",
        productName: "",
        quantity: ""
      });

    } catch (err) {
      alert(err.response?.data?.message || "Error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center items-center p-4">
      
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-6">
        
        {/* Header */}
        <h2 className="text-2xl font-semibold text-gray-800 mb-6 text-center">
          Make a Sale
        </h2>

        <div className="space-y-4">
          
          {/* Customer Name */}
          <input
            name="customerName"
            placeholder="Customer Name"
            value={sale.customerName}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-green-400"
          />

          {/* Mobile */}
          <input
            name="mobile"
            placeholder="Mobile Number"
            value={sale.mobile}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-green-400"
          />

          {/* Product Dropdown */}
          <select
            name="productName"
            value={sale.productName}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg p-3 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            <option value="">Select Product</option>

            {items.length > 0 ? (
              items.map((item, index) => (
                <option key={index} value={item.name}>
                  {item.name}
                </option>
              ))
            ) : (
              <option disabled>No products available</option>
            )}
          </select>

          {/* Quantity */}
          <input
            name="quantity"
            placeholder="Quantity"
            value={sale.quantity}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-green-400"
          />

          {/* Button */}
          <button
            onClick={handleSale}
            className="w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-lg font-medium transition duration-200 shadow-md"
          >
            Complete Purchase
          </button>

        </div>

      </div>
    </div>
  );
};

export default Sale;