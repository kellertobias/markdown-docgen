export default {
  name: "example-keys",
  transform(node) {
    if (node.type !== "inlineToken" || node.data?.kind !== "key") return;
    return {
      ...node,
      data: {
        ...node.data,
        presentation: {
          component: "key-sequence",
          keys: [{ label: node.value, variant: node.value === "RUN" ? "record" : "regular" }],
        },
      },
    };
  },
};
