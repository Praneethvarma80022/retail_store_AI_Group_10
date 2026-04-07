import { useState, useEffect } from "react";
import axios from "axios";

const Store = () => {
  const [product, setProduct] = useState({
    name: "",
    quantity: "",
    price: ""
  });

  const [products, setProducts] = useState([]);

  const handleChange = (e) => {
    setProduct({
      ...product,
      [e.target.name]: e.target.value
    });
  };

  const addProduct = async () => {
    try {
      await axios.post("http://localhost:5000/api/store/add", product);
      setProduct({ name: "", quantity: "", price: "" });
      fetchProducts();
    } catch (err) {
      console.log(err);
    }
  };

  const fetchProducts = async () => {
    const res = await axios.get("http://localhost:5000/api/store");
    setProducts(res.data);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center items-start py-10">
      
      <div className="w-full max-w-5xl bg-white shadow-lg rounded-2xl p-6">
        
        <h2 className="text-2xl font-semibold text-gray-700 mb-6">
          Store Management
        </h2>

        {/* Input Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
         <select
  name="name"
  value={product.name}
  onChange={handleChange}
  className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
>
  <option value="">Select Item</option>
  <option value="Mobile Case">Mobile Case</option>
  <option value="Charger">Charger</option>
  <option value="USB Cable">USB Cable</option>
  <option value="Earphones">Earphones</option>
  <option value="Bluetooth Headset">Bluetooth Headset</option>
  <option value="Power Bank">Power Bank</option>
  <option value="Screen Guard">Screen Guard</option>
  <option value="Memory Card">Memory Card</option>
  <option value="Adapter">Adapter</option>
</select>

          <input
            name="quantity"
            placeholder="Quantity"
            value={product.quantity}
            onChange={handleChange}
            className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <input
            name="price"
            placeholder="Price"
            value={product.price}
            onChange={handleChange}
            className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <button
            onClick={addProduct}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg px-4 py-2 transition duration-200"
          >
            Add Product
          </button>
        </div>

        {/* Table Section */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-blue-500 text-white text-left">
                <th className="p-3">Name</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Price</th>
                <th className="p-3">Total</th>
              </tr>
            </thead>

            <tbody>
              {products.length > 0 ? (
                products.map((p) => (
                  <tr
                    key={p._id}
                    className="border-b hover:bg-gray-50 transition"
                  >
                    <td className="p-3">{p.name}</td>
                    <td className="p-3">{p.quantity}</td>
                    <td className="p-3">₹{p.price}</td>
                    <td className="p-3 font-semibold text-green-600">
                      ₹{p.totalPrice}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="4"
                    className="text-center p-4 text-gray-500"
                  >
                    No products available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};

export default Store;