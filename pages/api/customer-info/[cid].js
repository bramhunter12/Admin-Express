// file: pages/api/customer-info/[cid].js
import axios from 'axios';

export default async function handler(req, res) {
  console.log("DEBUG - req.url:", req.url);
  console.log("DEBUG - req.query:", req.query);  // <-- This should show cid
  const { cid } = req.query; // ✅ Proper way to get dynamic [cid] from URL

  if (!cid) {
    return res.status(400).json({ error: "CID is required in the path." });
  }

  try {
    const response = await axios.get(
      `https://ipostal1-org.myfreshworks.com/crm/sales/api/lookup?q=${cid}&f=cf_mailbox_id&entities=contact`,
      {
        headers: {
          Authorization: `Token token=${process.env.FRESHSALES_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const contact = response.data?.contacts?.contacts?.[0];

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const fields = contact.custom_field || {};

    // Fetch full contact with related sales account to get cf_mc_features, address, and phone
    let mcFeatures = null;
    let storeAddress = null;
    let storePhone = null;
    try {
      const contactResponse = await axios.get(
        `https://ipostal1-org.myfreshworks.com/crm/sales/api/contacts/${contact.id}?include=sales_accounts`,
        {
          headers: {
            Authorization: `Token token=${process.env.FRESHSALES_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const partialAccount = contactResponse.data?.contact?.sales_accounts?.[0];
      if (partialAccount?.id) {
        const accountResponse = await axios.get(
          `https://ipostal1-org.myfreshworks.com/crm/sales/api/sales_accounts/${partialAccount.id}`,
          {
            headers: {
              Authorization: `Token token=${process.env.FRESHSALES_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        const accRaw = accountResponse.data;
        const accData = typeof accRaw === 'string' ? JSON.parse(accRaw) : accRaw;
        const acc = accData?.sales_account || {};
        mcFeatures = acc.custom_field?.cf_mc_features || null;
        const addressParts = [acc.address, acc.city, acc.state, acc.zipcode].filter(Boolean);
        storeAddress = addressParts.length ? addressParts.join(', ') : null;
        storePhone = acc.phone || null;
      }
    } catch (accountErr) {
      console.error("Sales account fetch error:", accountErr.response?.data || accountErr.message);
    }

    return res.status(200).json({
      mail_center: fields.cf_mail_center_for_campaign || "N/A",
      mailbox_status: fields.cf_mailbox_account_status || null,
      plan: fields.cf_mailbox_plan || "N/A",
      status: fields.cf_1583_doc_status || "N/A",
      member_since: fields.cf_plan_start_date || null,
      admin_link: fields.cf_link_to_customer_in_admin || null,
      mc_features: mcFeatures,
      store_address: storeAddress,
      store_phone: storePhone,
    });
  } catch (err) {
    console.error("API error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

